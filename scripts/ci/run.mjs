import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { git } from './git.mjs';
import { steps } from './steps.mjs';

export function pnpmInvocation(args) {
  if (process.platform !== 'win32') return { file: 'pnpm', args };
  const cli = process.env.npm_execpath || process.env.CI_PNPM_CLI;
  if (!cli || !/pnpm\.(?:c?js|mjs)$/.test(cli))
    throw new Error(
      'Run through pnpm ci:run, or set CI_PNPM_CLI to the trusted pnpm JS entrypoint',
    );
  return { file: process.execPath, args: [cli, ...args] };
}

// Only allow static command lists; changed paths are never command arguments.
export async function execute(args, observe = () => {}) {
  const invocation = pnpmInvocation(args);
  await new Promise((resolve, reject) => {
    const child = spawn(invocation.file, invocation.args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: false,
    });
    let tail = '',
      unsafeTestResult = false;
    const output = (data) => {
      const text = data.toString();
      observe(text);
      tail += text;
      const lines = tail.split('\n');
      tail = lines.pop();
      for (const line of lines)
        if (/# (?:skipped|todo|cancelled) [1-9]\d*/.test(line))
          unsafeTestResult = true;
    };
    child.stdout.on('data', (data) => {
      process.stdout.write(data);
      output(data);
    });
    child.stderr.on('data', (data) => {
      process.stderr.write(data);
      output(data);
    });
    child.on('error', reject);
    child.on('exit', (code) =>
      code === 0 && !unsafeTestResult
        ? resolve()
        : reject(
            new Error(
              `Required command failed (exit ${code}, skipped/todo/cancelled ${unsafeTestResult})`,
            ),
          ),
    );
  });
}

export async function run(job) {
  if (!Object.hasOwn(steps, job)) throw new Error('Unknown CI job');
  const startedAt = new Date().toISOString(),
    start = performance.now();
  const report = {
    version: 1,
    job,
    head: git(['rev-parse', 'HEAD']),
    startedAt,
    steps: [],
    phases: [],
    packageTestDurationsMs: {},
  };
  let failure;
  let lastPhase;
  try {
    for (const step of steps[job]) {
      const stepStart = performance.now();
      const result = {
        name: step.name,
        startedAt: new Date().toISOString(),
        result: 'failure',
      };
      report.steps.push(result);
      let textBuffer = '';
      try {
        await execute(step.args, (chunk) => {
          textBuffer += chunk;
          const lines = textBuffer.split('\n');
          textBuffer = lines.pop();
          for (const line of lines) {
            const stage = line.match(
              /^[>$] (tsx packages\/contracts\/src\/openapi-cli\.ts --check|prettier \. --check|(?:pnpm ci:lint && )?pnpm -r lint|pnpm -r typecheck|(?:pnpm ci:test && )?pnpm -r test|pnpm --filter @stock-app\/(?:api|web) build)$/,
            )?.[1];
            if (stage) {
              const now = performance.now();
              if (lastPhase) lastPhase.elapsedMs = now - lastPhase.start;
              lastPhase = { name: stage, start: now, elapsedMs: null };
              report.phases.push(lastPhase);
            }
            const duration = line.match(
              /((?:apps|packages)\/[a-z-]+) test: # duration_ms ([\d.]+)/,
            );
            if (duration)
              report.packageTestDurationsMs[duration[1]] = Number(duration[2]);
          }
        });
        if (
          step.clean?.length &&
          git(['status', '--porcelain', '--', ...step.clean])
        )
          throw new Error(`Generated drift in ${step.name}`);
        result.result = 'success';
      } finally {
        result.elapsedMs = performance.now() - stepStart;
        if (lastPhase) {
          lastPhase.elapsedMs = performance.now() - lastPhase.start;
          lastPhase = null;
        }
      }
    }
  } catch (error) {
    failure = error;
  }
  report.elapsedMs = performance.now() - start;
  report.result = failure ? 'failure' : 'success';
  for (const phase of report.phases) delete phase.start;
  mkdirSync('.ci', { recursive: true });
  writeFileSync(
    `.ci/report-${job}.json`,
    JSON.stringify(report, null, 2) + '\n',
  );
  if (process.env.GITHUB_STEP_SUMMARY) {
    const { appendFileSync } = await import('node:fs');
    appendFileSync(
      process.env.GITHUB_STEP_SUMMARY,
      `### ${job} (${report.head})\n\n| Step | Result | Seconds |\n|---|---|---:|\n${report.steps.map((step) => `| ${step.name} | ${step.result} | ${(step.elapsedMs / 1000).toFixed(3)} |`).join('\n')}\n`,
    );
  }
  if (failure) throw failure;
  return report;
}

if (process.argv[1]?.endsWith('run.mjs')) await run(process.argv[2]);
