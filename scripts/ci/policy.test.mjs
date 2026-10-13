import test from 'node:test';
import assert from 'node:assert/strict';
import {
  classify,
  assertPlan,
  assertResults,
  graphFromWorkspace,
} from './policy.mjs';
import { parseNameStatus, compareCommits, resolveCandidate } from './git.mjs';

const base = 'a'.repeat(40),
  head = 'b'.repeat(40);
export const graph = {
  api: ['application', 'contracts', 'domain'],
  application: ['domain'],
  contracts: [],
  domain: [],
  mobile: ['application', 'domain'],
  shared: [],
  web: ['application', 'contracts', 'domain'],
};
const input = (paths, extra = {}) => ({
  event: 'pull_request',
  base,
  head,
  comparison: 'valid',
  changes: paths.map((path) => ({ status: 'M', paths: [path] })),
  graph,
  ...extra,
});
for (const [label, paths, selected] of [
  ['docs', ['docs/web/DEV-00.md'], []],
  ['Web component', ['apps/web/src/routes/settings.tsx'], ['web']],
  ['Web styles', ['apps/web/src/styles/base.css'], ['web']],
  ['Web tests', ['apps/web/test/account-client.test.ts'], ['web']],
  ['API unit', ['apps/api/test/liveness.test.ts'], ['api']],
  ['API financial', ['apps/api/src/sales/register-sale.ts'], ['api']],
  [
    'auth/security',
    ['apps/api/src/auth/create-auth.ts', 'apps/api/src/security/rate-limit.ts'],
    ['api'],
  ],
  [
    'Postgres schema',
    ['apps/api/src/infrastructure/postgres/schema.ts'],
    ['api'],
  ],
  ['migrations', ['apps/api/drizzle/0004_security.sql'], ['api']],
  ['Domain financial', ['packages/domain/src/money/money.ts'], ['full']],
  ['Application', ['packages/application/src/register-sale.ts'], ['full']],
  [
    'Contracts',
    ['packages/contracts/src/entities.ts'],
    ['api', 'contracts', 'web'],
  ],
  [
    'OpenAPI generator',
    ['packages/contracts/src/openapi-cli.ts'],
    ['api', 'contracts', 'web'],
  ],
  [
    'OpenAPI artifact',
    ['docs/web/openapi/stockapp-v1.json'],
    ['api', 'contracts', 'web'],
  ],
  ['Mobile', ['apps/mobile/src/ui/product.tsx'], ['mobile']],
  ['lockfile', ['pnpm-lock.yaml'], ['full']],
  ['workspace', ['pnpm-workspace.yaml'], ['full']],
  ['workflow', ['.github/workflows/ci.yml'], ['full']],
  ['classifier', ['scripts/ci/policy.mjs'], ['full']],
  ['quality policy', ['AGENTS.md'], ['full']],
  ['unknown', ['unmapped/tool.bin'], ['full']],
  ['mixed Web/API', ['apps/web/src/a.ts', 'apps/api/src/a.ts'], ['api', 'web']],
  [
    'mixed shared/Web',
    ['packages/domain/src/a.ts', 'apps/web/src/a.ts'],
    ['full'],
  ],
  ['shared config', ['tsconfig.base.json'], ['full']],
  ['DB harness', ['apps/api/test/helpers/provisioning-gate.ts'], ['full']],
  ['Web test infrastructure', ['apps/web/test/fixtures.ts'], ['full']],
  ['runtime deployment configuration', ['apps/web/public/_headers'], ['full']],
  [
    'browser generated artifact',
    ['apps/web/src/api/generated/me.mjs'],
    ['full'],
  ],
  ['executable doc tooling', ['docs/check.mjs'], ['full']],
])
  test(`policy selects all necessary jobs: ${label}`, () => {
    const plan = classify(input(paths));
    assert.deepEqual(
      Object.keys(plan.jobs)
        .filter((job) => job !== 'policy' && plan.jobs[job])
        .sort(),
      selected.sort(),
    );
    assert.equal(plan.jobs.policy, true);
    assert.equal(
      plan.postgres,
      selected.includes('api') || selected.includes('full'),
    );
    assertPlan(plan);
  });
for (const status of ['D', 'R100', 'C100', 'T', 'U'])
  test(`${status} change falls back to full`, () => {
    const paths =
      status[0] === 'R' || status[0] === 'C'
        ? ['docs/old.md', 'apps/api/new.ts']
        : ['apps/web/src/a.ts'];
    assert.equal(
      classify(input([], { changes: [{ status, paths }] })).mode,
      'full',
    );
  });
for (const extra of [
  { changes: [] },
  { base: '' },
  { base: '0'.repeat(40) },
  { comparison: 'unavailable' },
  { graph: null },
  { event: 'unknown' },
])
  test(`conservative missing/invalid input ${JSON.stringify(extra)}`, () =>
    assert.equal(classify(input(['docs/x.md'], extra)).mode, 'full'));
for (const event of [
  'schedule',
  'workflow_dispatch',
  'release_candidate',
  'workflow_call',
])
  test(`${event} always full`, () =>
    assert.equal(classify(input(['docs/x.md'], { event })).mode, 'full'));
test('added docs allowed, unsafe filename never becomes a shell fragment', () => {
  assert.equal(
    classify(input([], { changes: [{ status: 'A', paths: ['docs/new.md'] }] }))
      .mode,
    'selective',
  );
  assert.equal(classify(input(['docs/a\n$(secret).md'])).mode, 'full');
});
test('Contracts transitively selects Mobile if the real graph gains that dependency', () => {
  const plan = classify(
    input(['packages/contracts/src/a.ts'], {
      graph: { ...graph, mobile: ['application', 'contracts', 'domain'] },
    }),
  );
  assert.equal(plan.jobs.mobile, true);
});
test('Contracts impact on a shared financial consumer widens to full', () => {
  const plan = classify(
    input(['packages/contracts/src/a.ts'], {
      graph: { ...graph, application: ['contracts', 'domain'] },
    }),
  );
  assert.equal(plan.mode, 'full');
  assert.equal(plan.jobs.full, true);
});
test('actual manifests/source/build graph includes all consumers and generated Web contracts', () => {
  assert.deepEqual(graphFromWorkspace(process.cwd()), graph);
});
const successful = (plan) =>
  Object.fromEntries([
    ['classify', { result: 'success' }],
    ...Object.entries(plan.jobs).map(([job, selected]) => [
      job,
      { result: selected ? 'success' : 'skipped' },
    ]),
  ]);
test('valid selective and full plans aggregate only authorized jobs', () => {
  for (const plan of [
    classify(input(['docs/a.md'])),
    classify(input(['apps/web/src/a.ts'])),
    classify(input(['pnpm-lock.yaml'])),
  ])
    assert.doesNotThrow(() => assertResults(plan, successful(plan)));
});
for (const result of [
  'skipped',
  'failure',
  'cancelled',
  'timed_out',
  undefined,
])
  test(`selected job ${String(result)} cannot turn quality green`, () => {
    const plan = classify(input(['apps/web/src/a.ts'])),
      needs = successful(plan);
    needs.web = result ? { result } : undefined;
    assert.throws(() => assertResults(plan, needs));
  });
test('missing minimal check, classifier failure and unauthorized execution fail closed', () => {
  const plan = classify(input(['docs/a.md']));
  for (const alteration of [
    { policy: { result: 'skipped' } },
    { classify: { result: 'failure' } },
    { api: { result: 'success' } },
  ])
    assert.throws(() =>
      assertResults(plan, { ...successful(plan), ...alteration }),
    );
});
test('incomplete or forged plan cannot suppress required consumer tests', () => {
  const plan = classify(input(['packages/contracts/src/a.ts']));
  for (const altered of [
    { ...plan, jobs: { ...plan.jobs, api: false } },
    { ...plan, jobs: {} },
    { ...plan, postgres: false },
    { ...plan, mode: 'docs' },
    { ...plan, head: '' },
  ])
    assert.throws(() => assertPlan(altered));
});
test('NUL git diff preserves rename/copy pairs and arbitrary literal path text', () => {
  assert.deepEqual(
    parseNameStatus(
      'M\0apps/web/src/a.ts\0R100\0docs/a.md\0docs/b.md\0C090\0x\0y\0',
    ),
    [
      { status: 'M', paths: ['apps/web/src/a.ts'] },
      { status: 'R100', paths: ['docs/a.md', 'docs/b.md'] },
      { status: 'C090', paths: ['x', 'y'] },
    ],
  );
  assert.throws(() => parseNameStatus('M\0'));
});
test('PR comparison uses merge-base; push uses before/after, never HEAD~1', () => {
  for (const event of ['pull_request', 'push']) {
    const calls = [];
    const git = (args) => {
      calls.push(args);
      return args[0] === 'merge-base'
        ? base
        : args[0] === 'diff'
          ? 'M\0docs/a.md\0'
          : head;
    };
    const compared = compareCommits({ event, base, head }, git);
    assert.equal(compared.comparison, 'valid');
    assert.equal(
      calls.some((args) => args[0] === 'merge-base'),
      event === 'pull_request',
    );
    assert.ok(calls.every((args) => !args.includes('HEAD~1')));
  }
});
test('failed/unavailable git comparison becomes full, never docs-only empty success', () => {
  const compared = compareCommits({ event: 'push', base, head }, () => {
    throw new Error('not found');
  });
  assert.equal(classify({ ...input([]), ...compared }).mode, 'full');
});
for (const changes of [[null], [false], [{}]])
  test(`malformed changes require full: ${JSON.stringify(changes)}`, () => {
    assert.equal(classify(input([], { changes })).mode, 'full');
  });
test('unknown job outside a validated plan cannot be ignored', () => {
  const plan = classify(input(['docs/a.md']));
  assert.throws(() =>
    assertResults(plan, {
      ...successful(plan),
      unknown: { result: 'failure' },
    }),
  );
});
test('release candidate SHA mismatch rejected, unsafe refs never reach Git', () => {
  assert.equal(
    resolveCandidate('main', head, () => head),
    head,
  );
  assert.throws(() => resolveCandidate('main', base, () => head));
  assert.throws(() =>
    resolveCandidate('main; echo secret', head, () =>
      assert.fail('unsafe ref reached git'),
    ),
  );
});
