import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import {
  cp,
  mkdtemp,
  mkdir,
  readFile,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { disposableDatabase } from './helpers.js';

const compiled = fileURLToPath(
  new URL('../../dist/infrastructure/postgres/migrate.js', import.meta.url),
);
async function run(connection: string, entry = compiled) {
  try {
    const output = await promisify(execFile)(process.execPath, [entry], {
      windowsHide: true,
      env: {
        ...process.env,
        DATABASE_URL: connection,
        PGAPPNAME: 'stockapp-dev02-migration',
      },
    });
    return { code: 0, logs: output.stdout + output.stderr };
  } catch (error) {
    if (
      !(error instanceof Error) ||
      !('code' in error) ||
      typeof error.code !== 'number' ||
      !('stdout' in error) ||
      !('stderr' in error)
    )
      throw new Error('Compiled migration process unavailable.');
    return {
      code: error.code,
      logs: String(error.stdout) + String(error.stderr),
    };
  }
}
async function isolatedAssets(t: TestContext, withSql: boolean) {
  const directory = await mkdtemp(join(tmpdir(), 'stockapp-dev02-migrate-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const api = join(directory, 'apps', 'api');
  await mkdir(api, { recursive: true });
  await cp(
    fileURLToPath(new URL('../../dist/', import.meta.url)),
    join(api, 'dist'),
    { recursive: true },
  );
  await writeFile(join(api, 'package.json'), '{"type":"module"}');
  await symlink(
    fileURLToPath(new URL('../../node_modules/', import.meta.url)),
    join(api, 'node_modules'),
    process.platform === 'win32' ? 'junction' : 'dir',
  );
  if (withSql)
    await cp(
      fileURLToPath(new URL('../../drizzle/', import.meta.url)),
      join(api, 'drizzle'),
      { recursive: true },
    );
  return {
    entry: join(api, 'dist', 'infrastructure', 'postgres', 'migrate.js'),
    sql: join(api, 'drizzle'),
  };
}

test(
  'compiled migrations initialize empty DB; same advisory lock fences concurrent runners and reruns preserve ledger',
  { timeout: 30000 },
  async (t) => {
    const pool = await disposableDatabase(t);
    assert.ok(pool.options.connectionString);
    const lock = await pool.connect();
    await lock.query('SELECT pg_advisory_lock(1937006960,2)');
    const first = run(pool.options.connectionString);
    const second = run(pool.options.connectionString);
    try {
      const deadline = performance.now() + 10000;
      let blocked = 0;
      while (performance.now() < deadline && blocked !== 2) {
        blocked = Number(
          (
            await pool.query(
              "SELECT count(*) AS count FROM pg_stat_activity WHERE datname=current_database() AND application_name='stockapp-dev02-migration' AND wait_event_type='Lock' AND query LIKE 'SELECT pg_advisory_lock(1937006960,%' ",
            )
          ).rows[0].count,
        );
        if (blocked !== 2)
          await new Promise<void>((resolve) => setImmediate(resolve));
      }
      assert.equal(
        blocked,
        2,
        'Both real migration processes must wait on the existing advisory lock.',
      );
      assert.equal(
        (
          await pool.query(
            "SELECT count(*) FROM pg_tables WHERE schemaname='public'",
          )
        ).rows[0].count,
        '0',
      );
    } finally {
      await lock.query('SELECT pg_advisory_unlock(1937006960,2)');
      lock.release();
      const results = await Promise.all([first, second]);
      for (const result of results) {
        assert.equal(result.code, 0);
        assert.equal(
          result.logs.includes('PostgreSQL migrations complete.'),
          true,
        );
        assert.equal(
          /postgresql:|SELECT|password|stack/i.test(result.logs),
          false,
        );
      }
    }
    const ledger = (
      await pool.query(
        'SELECT hash,created_at::text FROM drizzle.__drizzle_migrations ORDER BY id',
      )
    ).rows;
    assert.equal(ledger.length, 5);
    assert.equal((await run(pool.options.connectionString)).code, 0);
    assert.deepEqual(
      (
        await pool.query(
          'SELECT hash,created_at::text FROM drizzle.__drizzle_migrations ORDER BY id',
        )
      ).rows,
      ledger,
    );
    assert.equal(
      (
        await pool.query(
          "SELECT count(*) FROM pg_stat_activity WHERE datname=current_database() AND application_name='stockapp-dev02-migration'",
        )
      ).rows[0].count,
      '0',
    );
  },
);

test('compiled migration refuses missing SQL assets, closes its pool and propagates sanitized failure', async (t) => {
  const pool = await disposableDatabase(t);
  assert.ok(pool.options.connectionString);
  const assets = await isolatedAssets(t, false);
  const result = await run(pool.options.connectionString, assets.entry);
  assert.equal(result.code, 1);
  assert.equal(
    result.logs.trim(),
    'PostgreSQL migration failed. Check configuration and database availability.',
  );
  assert.equal(result.logs.includes(pool.options.connectionString), false);
  assert.equal(
    (
      await pool.query(
        "SELECT count(*) FROM pg_tables WHERE schemaname='public'",
      )
    ).rows[0].count,
    '0',
  );
  assert.equal(
    (
      await pool.query(
        "SELECT count(*) FROM pg_stat_activity WHERE datname=current_database() AND application_name='stockapp-dev02-migration'",
      )
    ).rows[0].count,
    '0',
  );
});

test('failed migration rolls back SQL and blocks continuation; approved assets subsequently migrate safely', async (t) => {
  const pool = await disposableDatabase(t);
  assert.ok(pool.options.connectionString);
  const assets = await isolatedAssets(t, true);
  const journal: { entries: { tag: string }[] } = JSON.parse(
    await readFile(join(assets.sql, 'meta', '_journal.json'), 'utf8'),
  );
  await writeFile(
    join(assets.sql, journal.entries[0].tag + '.sql'),
    'CREATE TABLE dev02_rollback_canary(id integer);\n--> statement-breakpoint\nSELECT 1/0;\n',
  );
  const failed = await run(pool.options.connectionString, assets.entry);
  assert.equal(failed.code, 1);
  assert.equal(
    failed.logs.trim(),
    'PostgreSQL migration failed. Check configuration and database availability.',
  );
  assert.equal(
    (
      await pool.query(
        "SELECT count(*) FROM pg_tables WHERE schemaname='public'",
      )
    ).rows[0].count,
    '0',
  );
  assert.equal(
    (await pool.query('SELECT count(*) FROM drizzle.__drizzle_migrations'))
      .rows[0].count,
    '0',
  );
  assert.equal(
    (
      await pool.query(
        "SELECT count(*) FROM pg_stat_activity WHERE datname=current_database() AND application_name='stockapp-dev02-migration'",
      )
    ).rows[0].count,
    '0',
  );
  assert.equal((await run(pool.options.connectionString)).code, 0);
  assert.equal(
    (await pool.query('SELECT count(*) FROM drizzle.__drizzle_migrations'))
      .rows[0].count,
    '5',
  );
});
