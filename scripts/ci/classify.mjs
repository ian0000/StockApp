import {
  appendFileSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { createHash } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { compareCommits, git, validSha } from './git.mjs';
import { classify, graphFromWorkspace } from './policy.mjs';

export function currentPlan() {
  const event = process.env.GITHUB_EVENT_NAME || 'local';
  const payload = process.env.GITHUB_EVENT_PATH
    ? JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'))
    : {};
  const head = git(['rev-parse', 'HEAD']);
  const expected =
    event === 'pull_request'
      ? payload.pull_request?.head?.sha
      : process.env.CI_CANDIDATE_SHA || process.env.GITHUB_SHA;
  if (expected && expected !== head)
    throw new Error('Checked out SHA differs from requested candidate');
  if (!validSha(head)) throw new Error('Invalid checkout SHA');
  const base =
    event === 'pull_request' ? payload.pull_request?.base?.sha : payload.before;
  const comparison = compareCommits({ event, base: base || '', head });
  let graph = null;
  try {
    graph = graphFromWorkspace(process.cwd());
  } catch {
    /* Unsupported graph requires full regression. */
  }
  return classify({ ...comparison, graph });
}

export const planDigest = (plan) =>
  createHash('sha256').update(JSON.stringify(plan)).digest('hex');

export function persistPlan() {
  const start = performance.now();
  const plan = currentPlan();
  mkdirSync('.ci', { recursive: true });
  writeFileSync('.ci/plan.json', JSON.stringify(plan, null, 2) + '\n');
  writeFileSync(
    '.ci/classification-timing.json',
    JSON.stringify({ elapsedMs: performance.now() - start, head: plan.head }) +
      '\n',
  );
  if (process.env.GITHUB_OUTPUT)
    appendFileSync(
      process.env.GITHUB_OUTPUT,
      Object.entries({
        ...plan.jobs,
        head: plan.head,
        digest: planDigest(plan),
      })
        .map(([name, value]) => `${name}=${value}\n`)
        .join(''),
    );
  console.log(JSON.stringify(plan, null, 2));
}

if (process.argv[1]?.endsWith('classify.mjs')) persistPlan();
