import assert from 'node:assert/strict';
import {
  appendFileSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';

export function durationSeconds(start, end, conclusion) {
  if (!start || !end || conclusion === 'skipped') return null;
  const milliseconds = Date.parse(end) - Date.parse(start);
  return Number.isFinite(milliseconds) && milliseconds >= 0
    ? milliseconds / 1000
    : null;
}

export async function recordTimings() {
  // This workflow runs trusted default-branch code with a read-only Actions token.
  // Candidate artifacts are parsed only as bounded JSON, never executed.
  const repository = process.env.GITHUB_REPOSITORY;
  const event = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'));
  const runId = String(event.workflow_run?.id);
  assert.match(repository, /^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/);
  assert.match(runId, /^\d+$/);
  async function request(path) {
    const response = await fetch(
      `${process.env.GITHUB_API_URL}/repos/${repository}${path}`,
      {
        headers: {
          Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
        },
      },
    );
    assert.ok(response.ok, `Timing metadata unavailable (${response.status})`);
    return response.json();
  }
  const [run, response] = await Promise.all([
    request(`/actions/runs/${runId}`),
    request(
      `/actions/runs/${runId}/attempts/${event.workflow_run.run_attempt}/jobs?per_page=100`,
    ),
  ]);
  assert.ok(response.total_count <= 100, 'Incomplete timing metadata');
  const jobs = response.jobs.map((job) => ({
    name: job.name,
    conclusion: job.conclusion,
    seconds: durationSeconds(job.started_at, job.completed_at, job.conclusion),
    steps: job.steps.map((step) => ({
      name: step.name,
      conclusion: step.conclusion,
      seconds: durationSeconds(
        step.started_at,
        step.completed_at,
        step.conclusion,
      ),
    })),
  }));
  const completed = response.jobs
    .map((job) => job.completed_at)
    .filter(Boolean)
    .sort()
    .at(-1);
  const summaries = [];
  const scan = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const file = join(directory, entry.name);
      if (entry.isDirectory()) scan(file);
      else if (entry.name === 'summary.json') {
        const bytes = readFileSync(file);
        assert.ok(
          bytes.length < 1024 * 1024,
          'Oversized candidate timing artifact',
        );
        const summary = JSON.parse(bytes.toString('utf8'));
        // Persist only measured metadata. No arbitrary artifact fields or stdout.
        summaries.push({
          head: /^[a-f0-9]{40}$/.test(summary.head) ? summary.head : null,
          mode: ['full', 'selective'].includes(summary.mode)
            ? summary.mode
            : null,
          result: summary.result === 'success' ? 'success' : 'failure',
          jobs: summary.jobs,
          stages: Object.values(summary.reports || {}).map((report) => ({
            job: report.job,
            elapsedMs: report.elapsedMs,
            steps: report.steps?.map((step) => ({
              name: step.name,
              result: step.result,
              elapsedMs: step.elapsedMs,
            })),
            phases: report.phases,
            packageTestDurationsMs: report.packageTestDurationsMs,
          })),
        });
      }
    }
  };
  scan('.ci/source-summaries');
  assert.ok(
    summaries.length > 0,
    'No measurement summary from completed workflow',
  );
  const timings = {
    version: 1,
    runId,
    attempt: run.run_attempt,
    workflowHead: run.head_sha,
    conclusion: run.conclusion,
    url: run.html_url,
    totalFromCreationSeconds: durationSeconds(run.created_at, completed),
    executionSeconds: durationSeconds(run.run_started_at, completed),
    jobs,
    summaries,
  };
  mkdirSync('.ci', { recursive: true });
  writeFileSync('.ci/timings.json', JSON.stringify(timings, null, 2) + '\n');
  appendFileSync(
    process.env.GITHUB_STEP_SUMMARY,
    `### Completed workflow timings\n\n[Source run](${run.html_url}) — ${run.conclusion}\n\nCreated to last job completion: ${timings.totalFromCreationSeconds}s; run start to last job completion: ${timings.executionSeconds}s. Parallel job durations must not be added.\n\n| Job | Result | Seconds |\n|---|---|---:|\n${jobs.map((job) => `| ${job.name.replace(/[|\r\n]/g, ' ')} | ${job.conclusion} | ${job.seconds} |`).join('\n')}\n\nExact candidate SHAs and stage/build/PG durations are in the timing artifact. Setup/install/PostgreSQL initialization are GitHub step timestamps.\n`,
  );
}

if (process.argv[1]?.endsWith('timings.mjs')) await recordTimings();
