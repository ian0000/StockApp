import test from 'node:test';
import assert from 'node:assert/strict';
import { assertReport } from './aggregate.mjs';
import { steps } from './steps.mjs';

const head = 'b'.repeat(40);
const report = (job) => ({
  version: 1,
  job,
  head,
  result: 'success',
  elapsedMs: 10,
  steps: steps[job].map((step) => ({
    name: step.name,
    result: 'success',
    elapsedMs: 1,
  })),
});

test('isolated Web job builds Contracts before Vite and requires its successful report', () => {
  const dependencyBuild = steps.web.findIndex(
    (step) => step.name === 'contracts:build',
  );
  const webBuild = steps.web.findIndex((step) => step.name === 'build:web');
  assert.ok(dependencyBuild >= 0 && dependencyBuild < webBuild);
  assert.deepEqual(steps.web[dependencyBuild].args, [
    '--filter',
    '@stock-app/contracts',
    'build',
  ]);
  for (const result of ['failure', 'skipped', 'cancelled'])
    assert.throws(() =>
      assertReport('web', head, {
        ...report('web'),
        steps: report('web').steps.map((step) =>
          step.name === 'contracts:build' ? { ...step, result } : step,
        ),
      }),
    );
  assert.throws(() =>
    assertReport('web', head, {
      ...report('web'),
      steps: report('web').steps.filter(
        (step) => step.name !== 'contracts:build',
      ),
    }),
  );
});

for (const job of Object.keys(steps))
  test(`complete command report required: ${job}`, () => {
    assert.doesNotThrow(() => assertReport(job, head, report(job)));
    for (const altered of [
      { ...report(job), head: 'a'.repeat(40) },
      { ...report(job), result: 'failure' },
      { ...report(job), steps: report(job).steps.slice(1) },
      {
        ...report(job),
        steps: report(job).steps.map((step) => ({
          ...step,
          result: 'skipped',
        })),
      },
    ])
      assert.throws(() => assertReport(job, head, altered));
  });

test('complete full commands preserved, real DB required for API and full only', () => {
  assert.ok(steps.full.some((step) => step.args.join(' ') === 'check'));
  for (const job of ['api', 'full']) {
    for (const name of [
      'test:db',
      'db:generate',
      'auth:generate',
      'auth:check',
    ])
      assert.ok(steps[job].some((step) => step.name === name));
  }
  for (const job of ['policy', 'web', 'mobile', 'contracts'])
    assert.ok(steps[job].every((step) => step.name !== 'test:db'));
  assert.ok(steps.web.some((step) => step.name === 'ci:validators'));
});
