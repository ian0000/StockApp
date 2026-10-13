import { createReadStream, createWriteStream } from 'node:fs';
import { open, stat, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { runProcess } from './process.js';
import { privateOutputParent } from './private-files.js';
import type { BackupTools } from './tools.js';

export async function fileDigest(path: string) {
  const hash = createHash('sha256');
  let bytes = 0;
  for await (const chunk of createReadStream(path)) {
    hash.update(chunk);
    bytes += chunk.length;
  }
  return { sha256: hash.digest('hex'), bytes };
}
export function validateRecipient(recipient: string) {
  // age validates the Bech32 checksum and curve encoding itself.
  if (!/^age1[023456789acdefghjklmnpqrstuvwxyz]{58}$/.test(recipient))
    throw new Error('A single X25519 age recipient is required.');
}
export async function assertCiphertext(path: string) {
  const file = await open(path, 'r');
  try {
    const header = Buffer.alloc(Buffer.byteLength('age-encryption.org/v1\n'));
    await file.read(header, 0, header.length, 0);
    if (header.toString() !== 'age-encryption.org/v1\n')
      throw new Error(
        'Plaintext or unsupported ciphertext cannot be uploaded.',
      );
  } finally {
    await file.close();
  }
}
export async function encryptFile(
  tools: BackupTools,
  input: string,
  output: string,
  recipient: string,
  signal?: AbortSignal,
) {
  validateRecipient(recipient);
  await privateOutputParent(output);
  let created = false;
  try {
    const file = await open(output, 'wx', 0o600);
    created = true;
    await runProcess(tools.age, ['--encrypt', '--recipient', recipient], {
      input: createReadStream(input),
      output: file.createWriteStream(),
      signal,
    });
    await assertCiphertext(output);
    return await fileDigest(output);
  } catch {
    if (created) await rm(output, { force: true });
    throw new Error('Backup encryption failed.');
  }
}
export async function decryptFile(
  tools: BackupTools,
  input: string,
  output: string,
  identity: string,
  signal?: AbortSignal,
) {
  await privateOutputParent(output);
  await assertCiphertext(input);
  await privateOutputParent(identity);
  if (!(await stat(identity)).isFile())
    throw new Error('Private age identity required.');
  let created = false;
  try {
    const file = await open(output, 'wx', 0o600);
    created = true;
    await runProcess(tools.age, ['--decrypt', '--identity', identity], {
      input: createReadStream(input),
      output: file.createWriteStream(),
      signal,
    });
  } catch {
    if (created) await rm(output, { force: true });
    throw new Error('Backup decryption failed.');
  }
}
export async function ephemeralIdentity(tools: BackupTools, identity: string) {
  await privateOutputParent(identity);
  // stdout goes to a new private file; no private key enters captured output.
  await runProcess(tools.keygen, [], {
    output: createWriteStream(identity, { flags: 'wx', mode: 0o600 }),
  });
  const recipient = await runProcess(tools.keygen, ['-y', identity]);
  validateRecipient(recipient);
  return recipient;
}
