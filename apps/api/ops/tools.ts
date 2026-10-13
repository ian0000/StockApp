import { createHash } from 'node:crypto';
import { writeFile, chmod } from 'node:fs/promises';
import { join } from 'node:path';
import { runProcess } from './process.js';

const assets = {
  'win32-x64': {
    age: [
      'windows-amd64.zip',
      'f48d8f8f9ebe903ab5027ed067652f2cc1db94bc206976430133b905dcd8e8c7',
    ],
    rclone: [
      'windows-amd64.zip',
      '8a9db2bad1dc79a65b3348fd857069598e2aab7cf4d118b77b1df23055aff818',
    ],
  },
  'linux-x64': {
    age: [
      'linux-amd64.tar.gz',
      'cbe24006683f8eb669266162894b9a522a1af52f2665fbc63a4bb032ed26ac10',
    ],
    rclone: [
      'linux-amd64.zip',
      '349ac8fba6ff65d6247043f1750cdcb518ec5d500ef91463a10d37c0ccdf3702',
    ],
  },
} as const;
export interface BackupTools {
  age: string;
  keygen: string;
  rclone: string;
}
export const versions = {
  age: '1.3.2',
  rclone: '1.75.2',
  postgres: '18.6',
} as const;

// Explicit preparation only. Fixed public releases, checksum before extraction,
// fixed members only, no system installation or application dependencies.
export async function prepareTools(directory: string): Promise<BackupTools> {
  const platform = `${process.platform}-${process.arch}`;
  if (!(platform in assets))
    throw new Error('Unsupported operator tools platform.');
  const selected = assets[platform as keyof typeof assets];
  const suffix = process.platform === 'win32' ? '.exe' : '';
  for (const tool of ['age', 'rclone'] as const) {
    const [asset, hash] = selected[tool];
    const version = versions[tool];
    const filename = `${tool}-v${version}-${asset}`;
    const url = `https://github.com/${tool === 'age' ? 'FiloSottile/age' : 'rclone/rclone'}/releases/download/v${version}/${filename}`;
    const response = await fetch(url);
    if (!response.ok)
      throw new Error('Pinned operator tool download unavailable.');
    const bytes = Buffer.from(await response.arrayBuffer());
    if (createHash('sha256').update(bytes).digest('hex') !== hash)
      throw new Error('Pinned operator tool checksum mismatch.');
    const archive = join(directory, filename);
    await writeFile(archive, bytes, { flag: 'wx', mode: 0o600 });
    const members =
      tool === 'age'
        ? [`age/age${suffix}`, `age/age-keygen${suffix}`]
        : [`rclone-v${version}-${asset.replace('.zip', '')}/rclone${suffix}`];
    if (process.platform !== 'win32' && filename.endsWith('.zip'))
      await runProcess('unzip', ['-q', archive, ...members, '-d', directory]);
    else await runProcess('tar', ['-xf', archive, '-C', directory, ...members]);
    for (const member of members) await chmod(join(directory, member), 0o700);
  }
  const tools = {
    age: join(directory, 'age', `age${suffix}`),
    keygen: join(directory, 'age', `age-keygen${suffix}`),
    rclone: join(
      directory,
      `rclone-v${versions.rclone}-${selected.rclone[0].replace('.zip', '')}`,
      `rclone${suffix}`,
    ),
  };
  await verifyTools(tools);
  return tools;
}
export async function verifyTools(tools: BackupTools) {
  if ((await runProcess(tools.age, ['--version'])) !== `v${versions.age}`)
    throw new Error('Incompatible age version.');
  if ((await runProcess(tools.keygen, ['--version'])) !== `v${versions.age}`)
    throw new Error('Incompatible age-keygen version.');
  if (
    !(await runProcess(tools.rclone, ['version'])).startsWith(
      `rclone v${versions.rclone}\n`,
    )
  )
    throw new Error('Incompatible rclone version.');
}
