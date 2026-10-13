import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { validSha } from './git.mjs';

const names = [
  'api',
  'application',
  'contracts',
  'domain',
  'mobile',
  'shared',
  'web',
];
const jobNames = ['policy', 'full', 'web', 'api', 'mobile', 'contracts'];
const sourceExtension = /\.(?:[cm]?[jt]sx?|css|scss)$/;
const safePath = (path) =>
  typeof path === 'string' &&
  !/[\x00-\x1f\x7f\\]/.test(path) &&
  !path.startsWith('/') &&
  !path.split('/').includes('..') &&
  !path.includes('//');

function validGraph(graph) {
  return (
    graph &&
    JSON.stringify(Object.keys(graph).sort()) === JSON.stringify(names) &&
    names.every(
      (name) =>
        Array.isArray(graph[name]) &&
        graph[name].every(
          (dependency) => names.includes(dependency) && dependency !== name,
        ) &&
        new Set(graph[name]).size === graph[name].length,
    )
  );
}

export function graphFromWorkspace(root) {
  const packages = [];
  for (const category of ['apps', 'packages']) {
    for (const entry of readdirSync(join(root, category), {
      withFileTypes: true,
    })) {
      if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
      const directory = join(root, category, entry.name);
      if (!existsSync(join(directory, 'package.json'))) continue;
      const manifest = JSON.parse(
        readFileSync(join(directory, 'package.json'), 'utf8'),
      );
      packages.push({
        name: manifest.name.replace('@stock-app/', ''),
        directory,
        manifest,
      });
    }
  }
  const graph = {};
  for (const { name, directory, manifest } of packages) {
    const edges = new Set();
    for (const [dependency, version] of Object.entries({
      ...manifest.dependencies,
      ...manifest.devDependencies,
      ...manifest.peerDependencies,
    })) {
      if (
        dependency.startsWith('@stock-app/') ||
        version.startsWith('workspace:')
      )
        edges.add(dependency.replace('@stock-app/', ''));
    }
    // Inspect source and build scripts as well as manifests: generated browser
    // validators, source aliases, and bundling can add dependencies.
    const scan = (path) => {
      for (const entry of readdirSync(path, { withFileTypes: true })) {
        if (
          [
            'node_modules',
            'dist',
            'build',
            '.expo',
            'coverage',
            'generated',
            'android',
            'ios',
          ].includes(entry.name)
        )
          continue;
        const file = join(path, entry.name);
        if (entry.isDirectory()) scan(file);
        else if (/\.(?:[cm]?[jt]sx?|json)$/.test(entry.name)) {
          const content = readFileSync(file, 'utf8');
          for (const match of content.matchAll(
            /@stock-app\/(api|application|contracts|domain|mobile|shared|web)\b|(?:\.\.\/)+packages\/(application|contracts|domain|shared)\b/g,
          )) {
            const dependency = match[1] || match[2];
            if (dependency !== name) edges.add(dependency);
          }
        }
      }
    };
    scan(directory);
    graph[name] = [...edges].sort();
  }
  if (!validGraph(graph))
    throw new Error('Unsupported workspace dependency graph');
  return Object.fromEntries(
    Object.entries(graph).sort(([a], [b]) => a.localeCompare(b)),
  );
}

export function classify(input) {
  const jobs = Object.fromEntries(
    jobNames.map((name) => [name, name === 'policy']),
  );
  const reasons = new Set();
  const packages = new Set();
  let full = false;
  const widen = (reason) => {
    full = true;
    reasons.add(reason);
  };
  const select = (name) => {
    packages.add(name);
    if (['api', 'web', 'mobile', 'contracts'].includes(name)) jobs[name] = true;
  };
  const consumers = (dependency) => {
    const selected = new Set([dependency]);
    let changed = true;
    while (changed) {
      changed = false;
      for (const [name, dependencies] of Object.entries(input.graph)) {
        if (
          !selected.has(name) &&
          dependencies.some((edge) => selected.has(edge))
        ) {
          selected.add(name);
          changed = true;
        }
      }
    }
    if (
      [...selected].some((name) =>
        ['application', 'domain', 'shared'].includes(name),
      )
    )
      widen('Shared financial package is a transitive consumer');
    for (const name of selected) select(name);
  };
  if (!['pull_request', 'push'].includes(input.event))
    widen('Full event or unsupported event');
  if (
    !validSha(input.base) ||
    !validSha(input.head) ||
    input.comparison !== 'valid' ||
    !Array.isArray(input.changes) ||
    input.changes.length === 0
  )
    widen('Missing, invalid, unavailable or empty comparison');
  if (!validGraph(input.graph))
    widen('Unavailable or unsupported dependency graph');
  if (!full)
    for (const change of input.changes) {
      if (
        !change ||
        typeof change !== 'object' ||
        !['A', 'M'].includes(change.status) ||
        !Array.isArray(change.paths) ||
        change.paths.length !== 1 ||
        !safePath(change.paths[0])
      ) {
        widen('Deletion, rename, copy or unsafe change');
        continue;
      }
      const path = change.paths[0];
      if (
        /^(packages\/(domain|application|shared)\/|scripts\/|\.github\/|AGENTS\.md$)/.test(
          path,
        )
      ) {
        widen('Shared behavior or quality infrastructure');
        continue;
      }
      if (
        path === 'docs/web/openapi/stockapp-v1.json' ||
        /^packages\/contracts\/(src|test)\//.test(path)
      ) {
        consumers('contracts');
        reasons.add('Contracts and transitive consumers, full PostgreSQL');
        continue;
      }
      if (/^(?:docs\/.*|[^/]+)\.md$/.test(path)) {
        reasons.add('Documentation checks');
        continue;
      }
      if (
        /^apps\/web\/(src|test)\//.test(path) &&
        sourceExtension.test(path) &&
        !/(?:\/generated\/|(?:fixtures?|helpers?|setup|harness)(?:[/.\-]|$))/.test(
          path,
        )
      ) {
        select('web');
        reasons.add(
          'Web source/styles/tests and browser validator reproduction',
        );
        continue;
      }
      if (
        /^apps\/api\/(src|test|drizzle)\//.test(path) &&
        !/^apps\/api\/test\/(?:helpers\/|postgres\/helpers\.)/.test(path)
      ) {
        select('api');
        reasons.add(
          'API/persistence: full PostgreSQL; focused mapping not proven',
        );
        continue;
      }
      if (
        /^apps\/mobile\/(src|app|test)\//.test(path) &&
        sourceExtension.test(path) &&
        !/(?:fixtures?|helpers?|setup|harness)(?:[/.\-]|$)/.test(path)
      ) {
        select('mobile');
        reasons.add('Mobile source and complete Mobile checks');
        continue;
      }
      widen('Global configuration, test infrastructure or unknown path');
    }
  if (full)
    for (const name of jobNames)
      jobs[name] = name === 'policy' || name === 'full';
  return {
    version: 1,
    event: input.event,
    base: input.base,
    head: input.head,
    comparison: input.comparison,
    changes: input.changes,
    graph: input.graph,
    mode: full ? 'full' : 'selective',
    jobs,
    postgres: jobs.api || jobs.full,
    packages: full ? names : [...packages].sort(),
    reasons: [...reasons].sort(),
  };
}

export function assertPlan(plan) {
  assert.ok(validSha(plan?.head), 'Missing exact candidate SHA');
  assert.deepEqual(
    plan,
    classify(plan),
    'Incomplete or inconsistent selection plan',
  );
  assert.equal(plan.jobs.policy, true);
}

export function assertResults(plan, needs) {
  assertPlan(plan);
  assert.deepEqual(
    Object.keys(needs || {}).sort(),
    ['classify', ...Object.keys(plan.jobs)].sort(),
    'Missing or unknown job results',
  );
  assert.equal(
    needs?.classify?.result,
    'success',
    'Classifier did not succeed',
  );
  for (const [job, selected] of Object.entries(plan.jobs))
    assert.equal(
      needs[job]?.result,
      selected ? 'success' : 'skipped',
      `Unauthorized result for ${job}`,
    );
}
