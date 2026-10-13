import { createReadStream } from 'node:fs';
import { open, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { readTestDatabaseUrl } from '../src/infrastructure/postgres/config.js';
import { createPostgresPool } from '../src/infrastructure/postgres/client.js';
import { runProcess, safeEnvironment } from './process.js';
import { privateOutputParent } from './private-files.js';

export function qaDatabase(connectionString: string, suiteOwned = true) {
  const url = new URL(
    readTestDatabaseUrl({ TEST_DATABASE_URL: connectionString }),
  );
  if (suiteOwned && !/^\/stockapp_test_[a-z0-9_]+$/.test(url.pathname))
    throw new Error(
      'Backup source must be a disposable suite-owned QA database.',
    );
  return url;
}
export function validatePostgresVersion(tool: string, version: string) {
  if (
    !['pg_dump', 'pg_restore'].includes(tool) ||
    !new RegExp(
      `^${tool} \\(PostgreSQL\\) 18\\.6(?: \\([^\\r\\n)]+\\))?$`,
    ).test(version)
  )
    throw new Error('Backup rehearsal requires PostgreSQL 18.6 clients.');
}
export async function pgTools(
  connectionString: string,
  options: { bin?: string; container?: string } = {},
) {
  const url = qaDatabase(connectionString);
  if (
    !options.container &&
    !options.bin &&
    process.env.GITHUB_ACTIONS === 'true'
  ) {
    const ids = (
      await runProcess('docker', [
        'ps',
        '--filter',
        `publish=${url.port || '5432'}`,
        '--format',
        '{{.ID}}',
      ])
    ).split(/\s+/);
    if (ids.length !== 1 || !/^[a-f0-9]{12,64}$/.test(ids[0]))
      throw new Error('Dedicated PostgreSQL QA container unavailable.');
    options = { ...options, container: ids[0] };
  }
  const env = safeEnvironment({
    PGHOST: options.container
      ? '127.0.0.1'
      : url.hostname.replace(/^\[|\]$/g, ''),
    PGPORT: options.container ? '5432' : url.port || '5432',
    PGUSER: decodeURIComponent(url.username),
    PGPASSWORD: decodeURIComponent(url.password),
    PGDATABASE: url.pathname.slice(1),
    PGSSLMODE: 'disable',
  });
  if (options.container) {
    if (!/^[a-zA-Z0-9_-]+$/.test(options.container))
      throw new Error('Invalid QA container identity.');
    const inspected: unknown = JSON.parse(
      await runProcess('docker', [
        'inspect',
        options.container,
        '--format',
        '{"image":{{json .Config.Image}},"ports":{{json .NetworkSettings.Ports}}}',
      ]),
    );
    if (!inspected || typeof inspected !== 'object')
      throw new Error('Invalid QA container inventory.');
    const item = inspected as {
      image?: string;
      ports?: Record<string, { HostPort: string }[] | null>;
    };
    if (
      item.image !== 'postgres:18.6' ||
      !item.ports?.['5432/tcp']?.some(
        (port) => port.HostPort === (url.port || '5432'),
      )
    )
      throw new Error('QA PostgreSQL container version/port mismatch.');
  }
  const command = (tool: 'pg_dump' | 'pg_restore', args: string[]) =>
    options.container
      ? {
          file: 'docker',
          args: [
            'exec',
            '-i',
            ...[
              'PGHOST',
              'PGPORT',
              'PGUSER',
              'PGPASSWORD',
              'PGDATABASE',
            ].flatMap((name) => ['--env', name]),
            options.container,
            tool,
            ...args,
          ],
        }
      : {
          file: options.bin
            ? join(
                options.bin,
                tool + (process.platform === 'win32' ? '.exe' : ''),
              )
            : tool,
          args,
        };
  for (const tool of ['pg_dump', 'pg_restore'] as const) {
    const invocation = command(tool, ['--version']);
    validatePostgresVersion(
      tool,
      await runProcess(invocation.file, invocation.args, { env }),
    );
  }
  return {
    async dump(output: string, snapshot?: string, signal?: AbortSignal) {
      await privateOutputParent(output);
      if (snapshot && !/^[a-f0-9-]+$/i.test(snapshot))
        throw new Error('Invalid exported snapshot.');
      const invocation = command('pg_dump', [
        '--format=custom',
        '--no-acl',
        ...(snapshot ? [`--snapshot=${snapshot}`] : []),
      ]);
      const file = await open(output, 'wx', 0o600);
      try {
        await runProcess(invocation.file, invocation.args, {
          env,
          output: file.createWriteStream(),
          signal,
        });
      } catch {
        await rm(output, { force: true });
        throw new Error('QA PostgreSQL dump failed.');
      }
    },
    async restore(
      input: string,
      target: OwnedRecovery,
      source: string,
      signal?: AbortSignal,
    ) {
      assertRecoveryTarget(target, source);
      if (qaDatabase(target.connectionString).href !== url.href)
        throw new Error('Restore connection does not match owned destination.');
      const file = await open(input, 'r');
      try {
        const magic = Buffer.alloc(5);
        await file.read(magic, 0, 5, 0);
        if (magic.toString() !== 'PGDMP')
          throw new Error('Custom PostgreSQL archive required.');
      } finally {
        await file.close();
      }
      const invocation = command('pg_restore', [
        '--exit-on-error',
        '--single-transaction',
        '--no-owner',
        '--no-acl',
        '--dbname',
        url.pathname.slice(1),
      ]);
      await runProcess(invocation.file, invocation.args, {
        env,
        input: createReadStream(input),
        signal,
      });
    },
  };
}

export interface OwnedRecovery {
  readonly pool: pg.Pool;
  readonly connectionString: string;
}
const owned = new WeakSet<OwnedRecovery>();
export function assertRecoveryTarget(target: OwnedRecovery, source: string) {
  if (
    !owned.has(target) ||
    qaDatabase(target.connectionString).href === qaDatabase(source).href
  )
    throw new Error(
      'Recovery requires a newly created database owned by this operation.',
    );
}
export async function withRecoveryDatabase<T>(
  adminUrl: string,
  source: string,
  action: (target: OwnedRecovery) => Promise<T>,
  provision: <U>(operation: () => Promise<U>) => Promise<U> = (operation) =>
    operation(),
  name = `stockapp_test_recovery_${randomUUID().replaceAll('-', '')}`,
): Promise<T> {
  const url = qaDatabase(adminUrl, false);
  qaDatabase(source);
  if (
    !/^stockapp_test_recovery_[a-f0-9]{32}$/.test(name) ||
    name === qaDatabase(source).pathname.slice(1)
  )
    throw new Error('Invalid or source recovery destination.');
  const admin = createPostgresPool(url.href);
  url.pathname = `/${name}`;
  const target = Object.freeze({
    connectionString: url.href,
    pool: createPostgresPool(url.href),
  });
  let created = false;
  try {
    const server = (
      await admin.query<{ version: string }>(
        "SELECT current_setting('server_version') AS version",
      )
    ).rows[0].version;
    if (!/^18\.6(?:\s|$)/.test(server))
      throw new Error('Recovery target requires PostgreSQL 18.6 server.');
    await provision(async () => {
      // CREATE itself rejects an existing destination; no DROP/reuse fallback.
      await admin.query(`CREATE DATABASE "${name}"`);
      created = true;
      await target.pool.query('SELECT 1');
    });
    owned.add(target);
    assertRecoveryTarget(target, source);
    return await action(target);
  } finally {
    owned.delete(target);
    await target.pool.end();
    try {
      if (created)
        await provision(() => admin.query(`DROP DATABASE "${name}"`));
    } finally {
      await admin.end();
    }
  }
}
