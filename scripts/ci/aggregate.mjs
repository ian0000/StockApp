import assert from 'node:assert/strict';
import {
  appendFileSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { assertPlan, assertResults } from './policy.mjs';
import { currentPlan } from './classify.mjs';
import { steps } from './steps.mjs';

export function assertReport(job, head, report) {
  assert.equal(report?.version, 1);
  assert.equal(report.job, job);
  assert.equal(report.head, head, 'Report is for another commit');
  assert.equal(report.result, 'success');
  assert.ok(Number.isFinite(report.elapsedMs) && report.elapsedMs >= 0);
  assert.deepEqual(
    report.steps.map((step) => step.name),
    steps[job].map((step) => step.name),
    'Missing or unexpected required commands',
  );
  for (const step of report.steps) {
    assert.equal(step.result, 'success', `Failed step ${step.name}`);
    assert.ok(Number.isFinite(step.elapsedMs) && step.elapsedMs >= 0);
  }
}

function reportsIn(directory) {
  const reports = {};
  const scan = (path) => {
    for (const entry of readdirSync(path, { withFileTypes: true })) {
      const file = join(path, entry.name);
      if (entry.isDirectory()) scan(file);
      else if (/^report-[a-z]+\.json$/.test(entry.name)) {
        const report = JSON.parse(readFileSync(file, 'utf8'));
        if (reports[report.job]) throw new Error('Duplicate job report');
        reports[report.job] = report;
      }
    }
  };
  scan(directory);
  return reports;
}

if (process.argv[1]?.endsWith('aggregate.mjs')) {
  const summary = { version: 1, result: 'failure' };
  try {
    const plan = JSON.parse(readFileSync('.ci/plan.json', 'utf8'));
    assertPlan(plan);
    assert.deepEqual(
      plan,
      currentPlan(),
      'Plan does not match actual event/diff/graph',
    );
    const needs = JSON.parse(process.env.CI_NEEDS || '{}');
    const reports = reportsIn('.ci/results');
    if (process.argv[2] === 'full') {
      assert.deepEqual(Object.keys(needs).sort(), ['regression', 'resolve']);
      assert.equal(plan.mode, 'full');
      assert.equal(needs.resolve?.result, 'success');
      assert.equal(needs.regression?.result, 'success');
      assert.deepEqual(Object.keys(reports), ['full']);
      assertReport('full', plan.head, reports.full);
    } else {
      assertResults(plan, needs);
      for (const [job, selected] of Object.entries(plan.jobs)) {
        if (selected) assertReport(job, plan.head, reports[job]);
        else assert.equal(reports[job], undefined, `Unselected report ${job}`);
      }
    }
    Object.assign(summary, {
      head: plan.head,
      mode: plan.mode,
      jobs: plan.jobs,
      reports,
      result: 'success',
    });
  } catch (error) {
    summary.error = error.message;
  }
  mkdirSync('.ci', { recursive: true });
  writeFileSync('.ci/summary.json', JSON.stringify(summary, null, 2) + '\n');
  if (process.env.GITHUB_STEP_SUMMARY)
    appendFileSync(
      process.env.GITHUB_STEP_SUMMARY,
      `### Quality policy: ${summary.result}\n\n${summary.head || 'No validated SHA'}\n\nSelected: ${Object.entries(
        summary.jobs || {},
      )
        .filter(([, selected]) => selected)
        .map(([name]) => name)
        .join(', ')}\n\nSkipped by policy: ${Object.entries(summary.jobs || {})
        .filter(([, selected]) => !selected)
        .map(([name]) => name)
        .join(
          ', ',
        )}\n\n${summary.error || 'All selected jobs and exact-commit command reports verified. GitGuardian is an independent external check.'}\n`,
    );
  console.log(JSON.stringify(summary, null, 2));
  if (summary.result !== 'success') process.exitCode = 1;
}
