import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { classify, graphFromWorkspace } from './policy.mjs';
import { compareCommits } from './git.mjs';
import { steps } from './steps.mjs';

test('real divergent PR and push diffs; CLI aggregation cannot accept missing/cancelled/skipped/foreign reports', () => {
  const root = process.cwd();
  const temporary = mkdtempSync(join(tmpdir(), 'stockapp-ci-test-'));
  const git = (args) =>
    execFileSync('git', args, { cwd: temporary, encoding: 'utf8' }).trimEnd();
  const put = (file, content) => {
    mkdirSync(dirname(join(temporary, file)), { recursive: true });
    writeFileSync(join(temporary, file), content);
  };
  const commit = () => {
    git(['add', '.']);
    git(['commit', '-qm', 'fixture']);
    return git(['rev-parse', 'HEAD']);
  };
  try {
    git(['init', '-q', '-b', 'main']);
    git(['config', 'user.name', 'CI fixture']);
    git(['config', 'user.email', 'ci-fixture@example.invalid']);
    for (const [category, names] of [
      ['apps', ['api', 'mobile', 'web']],
      ['packages', ['application', 'contracts', 'domain', 'shared']],
    ]) {
      for (const name of names) {
        const path = `${category}/${name}/package.json`;
        put(path, '');
        copyFileSync(join(root, path), join(temporary, path));
      }
    }
    put('docs/fixture.md', 'Fixture\n');
    const ancestor = commit();
    put('packages/domain/src/financial.ts', 'export const baseline = 1;\n');
    const main = commit();
    git(['checkout', '-qb', 'fixture', ancestor]);
    put('apps/web/src/view.tsx', 'export const view = 1;\n');
    const head = commit();
    const graph = graphFromWorkspace(temporary);
    const comparison = compareCommits(
      { event: 'pull_request', base: main, head },
      git,
    );
    assert.equal(comparison.base, ancestor);
    assert.deepEqual(comparison.changes, [
      { status: 'A', paths: ['apps/web/src/view.tsx'] },
    ]);
    const plan = classify({
      ...compareCommits({ event: 'push', base: ancestor, head }, git),
      graph,
    });
    assert.equal(plan.jobs.web, true);
    assert.equal(plan.postgres, false);
    put('.ci/plan.json', JSON.stringify(plan));
    put('.ci/event.json', JSON.stringify({ before: ancestor }));
    const reports = {};
    for (const job of ['policy', 'web']) {
      reports[job] = {
        version: 1,
        job,
        head,
        result: 'success',
        elapsedMs: 1,
        steps: steps[job].map((step) => ({
          name: step.name,
          result: 'success',
          elapsedMs: 1,
        })),
      };
      put(`.ci/results/report-${job}.json`, JSON.stringify(reports[job]));
    }
    const needs = {
      classify: { result: 'success' },
      ...Object.fromEntries(
        Object.entries(plan.jobs).map(([name, selected]) => [
          name,
          { result: selected ? 'success' : 'skipped' },
        ]),
      ),
    };
    const aggregate = (values) =>
      spawnSync(process.execPath, [join(root, 'scripts/ci/aggregate.mjs')], {
        cwd: temporary,
        encoding: 'utf8',
        env: {
          ...process.env,
          GITHUB_EVENT_NAME: 'push',
          GITHUB_EVENT_PATH: join(temporary, '.ci/event.json'),
          GITHUB_SHA: head,
          GITHUB_STEP_SUMMARY: '',
          CI_NEEDS: JSON.stringify(values),
        },
      });
    assert.equal(aggregate(needs).status, 0);
    for (const result of ['failure', 'cancelled', 'skipped'])
      assert.equal(aggregate({ ...needs, web: { result } }).status, 1);
    assert.equal(
      aggregate({ ...needs, classify: { result: 'failure' } }).status,
      1,
    );
    put(
      '.ci/results/report-web.json',
      JSON.stringify({ ...reports.web, head: ancestor }),
    );
    assert.equal(aggregate(needs).status, 1);
    put(
      '.ci/results/report-web.json',
      JSON.stringify({ ...reports.web, steps: [] }),
    );
    assert.equal(aggregate(needs).status, 1);
    put(
      '.ci/plan.json',
      JSON.stringify({ ...plan, jobs: { ...plan.jobs, web: false } }),
    );
    assert.equal(aggregate(needs).status, 1);
    assert.equal(
      JSON.parse(readFileSync(join(temporary, '.ci/summary.json'), 'utf8'))
        .result,
      'failure',
    );
    for (const job of ['policy', 'web'])
      unlinkSync(join(temporary, `.ci/results/report-${job}.json`));
    const fullNeeds = {
      resolve: { result: 'success' },
      regression: { result: 'success' },
    };
    put(
      '.ci/results/report-full.json',
      JSON.stringify({
        version: 1,
        job: 'full',
        head,
        result: 'success',
        elapsedMs: 1,
        steps: steps.full.map((step) => ({
          name: step.name,
          result: 'success',
          elapsedMs: 1,
        })),
      }),
    );
    for (const event of ['workflow_dispatch', 'schedule']) {
      const env = {
        ...process.env,
        GITHUB_EVENT_NAME: event,
        GITHUB_EVENT_PATH: join(temporary, '.ci/event.json'),
        GITHUB_SHA: head,
        CI_CANDIDATE_SHA: head,
        GITHUB_STEP_SUMMARY: '',
        CI_EXPECTED_SHA: event === 'workflow_dispatch' ? head : '',
      };
      const invoke = (file, args = [], extra = {}) =>
        spawnSync(
          process.execPath,
          [join(root, `scripts/ci/${file}.mjs`), ...args],
          { cwd: temporary, encoding: 'utf8', env: { ...env, ...extra } },
        );
      assert.equal(invoke('resolve').status, 0);
      assert.equal(
        JSON.parse(readFileSync(join(temporary, '.ci/plan.json'), 'utf8')).mode,
        'full',
      );
      assert.equal(
        invoke('aggregate', ['full'], { CI_NEEDS: JSON.stringify(fullNeeds) })
          .status,
        0,
      );
      assert.equal(
        invoke('aggregate', ['full'], {
          CI_NEEDS: JSON.stringify({
            ...fullNeeds,
            regression: { result: 'cancelled' },
          }),
        }).status,
        1,
      );
      if (event === 'workflow_dispatch')
        assert.equal(
          invoke('resolve', [], { CI_EXPECTED_SHA: ancestor }).status,
          1,
        );
    }
  } finally {
    if (
      dirname(temporary) !== resolve(tmpdir()) ||
      !temporary.startsWith(join(tmpdir(), 'stockapp-ci-test-'))
    )
      throw new Error('Unsafe temporary cleanup target');
    rmSync(temporary, { recursive: true });
  }
});
