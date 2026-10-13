import { spawn } from 'node:child_process';
import { pipeline, finished } from 'node:stream/promises';
import type { Readable, Writable } from 'node:stream';

export function safeEnvironment(
  extra: NodeJS.ProcessEnv = {},
): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const name of [
    'PATH',
    'Path',
    'SystemRoot',
    'WINDIR',
    'TEMP',
    'TMP',
    'HOME',
    'USERPROFILE',
  ])
    if (process.env[name]) env[name] = process.env[name];
  return { ...env, ...extra };
}

// No raw child error, command line, output or environment crosses this boundary.
export async function runProcess(
  file: string,
  args: readonly string[],
  options: {
    env?: NodeJS.ProcessEnv;
    input?: Readable;
    output?: Writable;
    signal?: AbortSignal;
  } = {},
): Promise<string> {
  if (options.signal?.aborted) {
    const streams = [options.input, options.output].filter(
      (stream) => stream !== undefined,
    );
    for (const stream of streams) stream.destroy();
    await Promise.all(
      streams.map((stream) =>
        finished(stream, { cleanup: true }).catch(() => {}),
      ),
    );
    throw new Error('Operator execution interrupted.');
  }
  const child = spawn(file, args, {
    env: options.env ?? safeEnvironment(),
    shell: false,
    windowsHide: true,
    signal: options.signal,
  });
  child.stderr.resume();
  let text = '';
  const completion = new Promise<void>((resolve, reject) => {
    child.once('error', () =>
      reject(new Error('Operator tool unavailable or interrupted.')),
    );
    child.once('close', (code) =>
      code === 0 ? resolve() : reject(new Error('Operator tool failed.')),
    );
  });
  const jobs: Promise<unknown>[] = [completion];
  if (options.input) jobs.push(pipeline(options.input, child.stdin));
  else child.stdin.end();
  if (options.output) jobs.push(pipeline(child.stdout, options.output));
  else {
    child.stdout.on('data', (chunk: Buffer) => {
      // Only tool version/keygen public output belongs here, never a dump.
      if (text.length + chunk.length > 8192) child.kill();
      else text += chunk.toString();
    });
  }
  try {
    await Promise.all(jobs);
    return text.replaceAll('\r\n', '\n').trim();
  } catch {
    child.kill();
    await Promise.allSettled(jobs);
    throw new Error(
      'Operator tool failed or interrupted; diagnostics withheld.',
    );
  }
}
