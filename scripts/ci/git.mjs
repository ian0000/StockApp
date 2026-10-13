import { execFileSync } from 'node:child_process';

export const validSha = (value) =>
  typeof value === 'string' &&
  /^[a-f0-9]{40}$/i.test(value) &&
  !/^0+$/.test(value);
export const git = (args) =>
  execFileSync('git', args, {
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  }).trimEnd();

export function parseNameStatus(output) {
  if (!output) return [];
  const fields = output.split('\0');
  if (fields.pop() !== '') throw new Error('Git diff must be NUL terminated');
  const changes = [];
  while (fields.length) {
    const status = fields.shift();
    if (!/^(?:[AMDUT]|[RC]\d{1,3})$/.test(status))
      throw new Error('Invalid Git status');
    const count = /^[RC]/.test(status) ? 2 : 1;
    const paths = fields.splice(0, count);
    if (paths.length !== count || paths.some((path) => !path))
      throw new Error('Incomplete Git path');
    changes.push({ status, paths });
  }
  return changes;
}

export function compareCommits(input, execute = git) {
  try {
    if (
      !['pull_request', 'push'].includes(input.event) ||
      !validSha(input.base) ||
      !validSha(input.head)
    )
      throw new Error('Unavailable comparison');
    execute(['cat-file', '-e', `${input.base}^{commit}`]);
    execute(['cat-file', '-e', `${input.head}^{commit}`]);
    const base =
      input.event === 'pull_request'
        ? execute(['merge-base', input.base, input.head]).trim()
        : input.base;
    if (!validSha(base)) throw new Error('Invalid merge base');
    // execFile argument arrays and NUL delimiters keep filenames out of shell code.
    const output = execute([
      'diff',
      '--name-status',
      '-z',
      '--find-renames',
      '--find-copies',
      '--find-copies-harder',
      base,
      input.head,
      '--',
    ]);
    return {
      ...input,
      base,
      comparison: 'valid',
      changes: parseNameStatus(output),
    };
  } catch {
    return { ...input, comparison: 'unavailable', changes: null };
  }
}

export function resolveCandidate(ref, expectedSha, execute = git) {
  if (
    typeof ref !== 'string' ||
    !/^[a-zA-Z0-9][a-zA-Z0-9._/-]*$/.test(ref) ||
    ref.includes('..') ||
    ref.includes('//') ||
    !validSha(expectedSha)
  )
    throw new Error('Invalid candidate ref/SHA');
  const resolved = execute(['rev-parse', '--verify', `${ref}^{commit}`]).trim();
  if (!validSha(resolved) || resolved !== expectedSha)
    throw new Error('Candidate SHA mismatch');
  return resolved;
}
