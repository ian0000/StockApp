import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { readTestDatabaseUrl } from '../../src/infrastructure/postgres/config.js';

type Tool = 'pg_dump' | 'pg_restore';
function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

async function capture(
  file: string,
  args: readonly string[],
  env: NodeJS.ProcessEnv,
  input?: Buffer,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const child = spawn(file, args, { env, windowsHide: true, shell: false });
    const chunks: Buffer[] = [];
    child.stdout.on('data', (chunk: Buffer) => chunks.push(chunk));
    // Never put dump data, connection diagnostics or credentials in TAP output.
    child.stderr.resume();
    child.stdin.on('error', () => {});
    child.once('error', () =>
      reject(new Error('PostgreSQL QA tooling unavailable.')),
    );
    child.once('close', (code) =>
      code === 0
        ? resolve(Buffer.concat(chunks))
        : reject(new Error('PostgreSQL QA tooling failed.')),
    );
    child.stdin.end(input);
  });
}

export async function postgresTools(connectionString: string) {
  const url = new URL(
    readTestDatabaseUrl({ TEST_DATABASE_URL: connectionString }),
  );
  if (!/^\/stockapp_test_[a-z0-9_]+$/.test(url.pathname))
    throw new Error('Dump/restore requires a suite-owned disposable database.');
  const databaseName = url.pathname.slice(1);
  let container: string | undefined;
  if (process.env.GITHUB_ACTIONS === 'true') {
    // CI already provisions postgres:18.6. Use its own matching clients rather
    // than installing packages or accepting Ubuntu's potentially older pg_dump.
    const ids = (
      await capture(
        'docker',
        [
          'ps',
          '--filter',
          `publish=${url.port || '5432'}`,
          '--format',
          '{{.ID}}',
        ],
        process.env,
      )
    )
      .toString()
      .trim()
      .split(/\s+/);
    if (ids.length !== 1 || !/^[a-f0-9]{12,64}$/.test(ids[0]))
      throw new Error('Dedicated CI PostgreSQL container unavailable.');
    const inspected: unknown = JSON.parse(
      (await capture('docker', ['inspect', ids[0]], process.env)).toString(),
    );
    if (!Array.isArray(inspected) || inspected.length !== 1)
      throw new Error('Invalid PostgreSQL container inventory.');
    const item: unknown = inspected[0];
    if (
      !record(item) ||
      !record(item.Config) ||
      item.Config.Image !== 'postgres:18.6' ||
      !record(item.NetworkSettings) ||
      !record(item.NetworkSettings.Ports)
    )
      throw new Error('CI PostgreSQL identity/port mismatch.');
    const ports: unknown = item.NetworkSettings.Ports['5432/tcp'];
    if (
      !Array.isArray(ports) ||
      !ports.some(
        (port: unknown) =>
          record(port) && port.HostPort === (url.port || '5432'),
      )
    )
      throw new Error('CI PostgreSQL port mismatch.');
    container = ids[0];
  }
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    PGHOST: container ? '127.0.0.1' : url.hostname.replace(/^\[|\]$/g, ''),
    PGPORT: container ? '5432' : url.port || '5432',
    PGUSER: decodeURIComponent(url.username),
    PGPASSWORD: decodeURIComponent(url.password),
    PGDATABASE: databaseName,
    PGSSLMODE: 'disable',
  };
  // libpq must not inherit an alternate host/service/passfile from the operator.
  // These clients are exclusively for loopback synthetic QA, never UAT/PROD.
  for (const name of [
    'PGHOSTADDR',
    'PGSERVICE',
    'PGSERVICEFILE',
    'PGPASSFILE',
    'PGOPTIONS',
  ])
    delete env[name];
  const run = (tool: Tool, args: readonly string[], input?: Buffer) => {
    if (container)
      return capture(
        'docker',
        [
          'exec',
          '-i',
          ...['PGHOST', 'PGPORT', 'PGUSER', 'PGPASSWORD', 'PGDATABASE'].flatMap(
            (name) => ['--env', name],
          ),
          container,
          tool,
          ...args,
        ],
        env,
        input,
      );
    const binary = process.env.TEST_POSTGRES_BIN
      ? join(
          process.env.TEST_POSTGRES_BIN,
          tool + (process.platform === 'win32' ? '.exe' : ''),
        )
      : tool;
    return capture(binary, args, env, input);
  };
  for (const tool of ['pg_dump', 'pg_restore'] as const) {
    const version = (await run(tool, ['--version'])).toString().trim();
    if (
      !new RegExp(
        `^${tool} \\(PostgreSQL\\) 18\\.6(?: \\([^\\r\\n)]+\\))?$`,
      ).test(version)
    )
      throw new Error('Recovery rehearsal requires PostgreSQL 18.6 clients.');
  }
  return {
    dump: (snapshot?: string) =>
      run('pg_dump', [
        '--format=custom',
        '--no-acl',
        ...(snapshot ? [`--snapshot=${snapshot}`] : []),
      ]),
    restore: (input: Buffer) =>
      run(
        'pg_restore',
        [
          '--exit-on-error',
          '--single-transaction',
          '--no-owner',
          '--no-acl',
          '--dbname',
          databaseName,
        ],
        input,
      ),
  };
}
