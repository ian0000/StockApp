import { mkdtemp, chmod, rm, realpath, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve, relative, isAbsolute } from 'node:path';
import { runProcess } from './process.js';

const repository = resolve(import.meta.dirname, '../../..');
function inside(root: string, path: string) {
  const distance = relative(root, path);
  return !distance || (!distance.startsWith('..') && !isAbsolute(distance));
}
export async function privateWorkspace<T>(
  action: (directory: string) => Promise<T>,
  parent = tmpdir(),
): Promise<T> {
  const actualParent = await realpath(parent);
  if (inside(await realpath(repository), actualParent))
    throw new Error(
      'Private operator workspace must be outside the repository.',
    );
  const directory = await mkdtemp(
    join(actualParent, 'stockapp-backup-private-'),
  );
  try {
    await chmod(directory, 0o700);
    if (process.platform === 'win32') {
      // chmod alone does not restrict Windows ACLs. Grant only the current user,
      // remove inherited grants; elevated administrators remain an OS trust boundary.
      const owner = await runProcess('whoami', []);
      if (!/^[\w .\\@-]+$/.test(owner))
        throw new Error('Cannot establish private workspace owner.');
      await runProcess('icacls', [
        directory,
        '/inheritance:r',
        '/grant:r',
        `${owner}:(OI)(CI)F`,
      ]);
    }
    return await action(directory);
  } finally {
    const actual = await realpath(directory);
    if (dirname(actual) !== actualParent || !inside(directory, actual))
      throw new Error('Private workspace cleanup ownership mismatch.');
    await rm(actual, { recursive: true, force: false });
  }
}
export async function privateOutputParent(path: string) {
  const parent = await realpath(dirname(resolve(path)));
  if (inside(await realpath(repository), parent))
    throw new Error('Operator artifacts must be outside the repository.');
  return parent;
}
export async function privateSubdirectory(parent: string, name: string) {
  if (!/^[a-z0-9-]+$/.test(name))
    throw new Error('Invalid private directory name.');
  const path = join(parent, name);
  await mkdir(path, { mode: 0o700 });
  return path;
}
