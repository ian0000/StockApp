import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHash } from 'node:crypto';
import { readFile, open, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import type pg from 'pg';
import { deletionFixture } from '../deletion/helpers.js';
import { id } from './helpers.js';
import { withProvisioningGate } from '../helpers/provisioning-gate.js';
import { privateWorkspace } from '../../ops/private-files.js';
import { pgTools, withRecoveryDatabase } from '../../ops/postgres.js';
import { prepareTools } from '../../ops/tools.js';
import { installedTools, runBackupCli } from '../../ops/cli.js';
import {
  encryptFile,
  decryptFile,
  ephemeralIdentity,
} from '../../ops/encryption.js';
import { manifestFor } from '../../ops/workflow.js';
import { localTransport, verifiedUpload } from '../../ops/transport.js';
import {
  registryCli,
  captureRecoveryEvidence,
  verifyRecoveryEvidence,
} from '../../ops/suppressions.js';
import { createCommand, updateCommand } from '../products/helpers.js';
import { decodeRegistry } from '../../src/deletion/registry.js';
import { createDatabase } from '../../src/infrastructure/postgres/client.js';
import { createCommandExecutor } from '../../src/infrastructure/postgres/command-executor.js';
import { commandFingerprint } from '../../src/commands/fingerprint.js';
import { createReadinessCheck } from '../../src/infrastructure/postgres/readiness.js';
import { suppressionIdentifier } from '../../src/deletion/model.js';
import { createAuth } from '../../src/auth/create-auth.js';
import {
  resolveAuthenticatedUser,
  resolveCloudInventory,
} from '../../src/ownership/context.js';

const digest = (value: unknown) =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex');
async function snapshot(pool: pg.Pool) {
  const tables = (
    await pool.query<{ schemaname: string; tablename: string }>(
      "SELECT schemaname,tablename FROM pg_tables WHERE schemaname IN ('public','drizzle') ORDER BY schemaname,tablename",
    )
  ).rows;
  const rows = [];
  for (const table of tables) {
    assert.match(table.schemaname, /^[a-z_]+$/);
    assert.match(table.tablename, /^[a-z_]+$/);
    const result = await pool.query(
      `SELECT row_to_json(t)::text AS row FROM "${table.schemaname}"."${table.tablename}" t ORDER BY row_to_json(t)::text`,
    );
    rows.push({
      table: table.tablename,
      count: result.rowCount,
      digest: digest(result.rows),
    });
  }
  const structure = (
    await pool.query(
      "SELECT c.relname,n.nspname,p.conname,p.contype,p.convalidated,pg_get_constraintdef(p.oid) AS definition FROM pg_constraint p JOIN pg_class c ON c.oid=p.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ('public','drizzle') ORDER BY n.nspname,c.relname,p.conname",
    )
  ).rows;
  const sequences = (
    await pool.query(
      "SELECT schemaname,sequencename,last_value FROM pg_sequences WHERE schemaname IN ('public','drizzle') ORDER BY schemaname,sequencename",
    )
  ).rows;
  return { rows, constraints: digest(structure), sequences: digest(sequences) };
}

async function survivor(pool: pg.Pool, userId: string, inventoryId: string) {
  const rows: unknown[] = [];
  for (const table of [
    'products',
    'inventory_states',
    'inventory_movements',
    'sales',
    'sale_items',
    'purchases',
    'stock_adjustments',
    'inventory_change_sets',
  ])
    rows.push(
      (
        await pool.query(
          `SELECT row_to_json(t)::text AS row FROM "${table}" t WHERE inventory_id=$1 ORDER BY row_to_json(t)::text`,
          [inventoryId],
        )
      ).rows,
    );
  rows.push(
    (
      await pool.query(
        'SELECT row_to_json(t)::text AS row FROM "user" t WHERE id=$1',
        [userId],
      )
    ).rows,
  );
  for (const table of ['account', 'session'])
    rows.push(
      (
        await pool.query(
          `SELECT row_to_json(t)::text AS row FROM "${table}" t WHERE user_id=$1 ORDER BY row_to_json(t)::text`,
          [userId],
        )
      ).rows,
    );
  rows.push(
    (
      await pool.query(
        'SELECT row_to_json(t)::text AS row FROM businesses t WHERE owner_user_id=$1',
        [userId],
      )
    ).rows,
  );
  return digest(rows);
}

test(
  'PostgreSQL 18.6 logical snapshot restores exact history; independent suppression precedes recovery verification',
  { timeout: 60000 },
  async (t) => {
    await privateWorkspace(async (privateDirectory) => {
      const encryptionTools = process.env.BACKUP_TOOLS_DIRECTORY
        ? installedTools(process.env)
        : await prepareTools(privateDirectory);
      const identity = join(privateDirectory, 'ephemeral-identity');
      const recipient = await ephemeralIdentity(encryptionTools, identity);
      const f = await deletionFixture(t);
      const a = await f.owner('recovery-a');
      const b = await f.owner('recovery-b');
      const history = await f.history(a.context, 'recovery-a');
      const bHistory = await f.history(b.context, 'recovery-b');
      const precision = createCommand({
        name: 'Recovery precision',
        regularSalePrice: '9007199254740991',
        initialStock: 1,
        initialUnitCost: '1234567',
        initialMovementId: id(),
      });
      await f.run(a.context, precision);
      await f.pool.query(
        'UPDATE products SET metadata_revision=9007199254740992 WHERE id=$1',
        [history.archived.payload.productId],
      );
      await f.pool.query(
        'UPDATE inventory_states SET state_revision=9007199254740992 WHERE product_id=$1',
        [history.archived.payload.productId],
      );
      const before = await snapshot(f.pool);
      const bBefore = await survivor(
        f.pool,
        b.authenticated.user.id,
        b.context.inventory.id,
      );
      assert.ok(f.pool.options.connectionString);
      const pgOptions = {
        bin: process.env.TEST_POSTGRES_BIN,
        container: process.env.BACKUP_QA_POSTGRES_CONTAINER,
      };
      const tools = await pgTools(f.pool.options.connectionString, pgOptions);
      const archive = join(privateDirectory, 'snapshot.dump');
      const held = await f.pool.connect();
      try {
        await held.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
        const exported = (
          await held.query<{ snapshot: string }>(
            'SELECT pg_export_snapshot() AS snapshot',
          )
        ).rows[0].snapshot;
        // The writer commits after the exported snapshot. Its receipt and metadata
        // must both be excluded from the old dump, while the source remains usable.
        await f.run(
          a.context,
          updateCommand(history.zero.payload.productId, '0', {
            regularSalePrice: '1234567',
          }),
        );
        await tools.dump(archive, exported);
      } finally {
        await held.query('ROLLBACK');
        held.release();
      }
      const file = await open(archive, 'r');
      try {
        const header = Buffer.alloc(5);
        await file.read(header, 0, 5, 0);
        assert.equal(header.toString(), 'PGDMP');
      } finally {
        await file.close();
      }
      assert.notEqual(digest(await snapshot(f.pool)), digest(before));
      const transport = localTransport(join(privateDirectory, 'r2-simulation'));
      const manifestOptions = {
        sourceCommit: '402988098caf97262ce321d3e3d5d9fe23320126',
        keyVersion: 'ephemeral-qa',
        suppressionKeyVersion: 'qa-original',
      };
      const ciphertext = join(privateDirectory, 'snapshot.dump.age');
      const manifest = manifestFor(
        'postgres',
        recipient,
        await encryptFile(encryptionTools, archive, ciphertext, recipient),
        manifestOptions,
      );
      const downloaded = join(privateDirectory, 'snapshot.download.age');
      await verifiedUpload(transport, manifest, ciphertext, downloaded);
      const decrypted = join(privateDirectory, 'snapshot.restored.dump');
      await decryptFile(encryptionTools, downloaded, decrypted, identity);
      const cliStore = join(privateDirectory, 'cli-store');
      await mkdir(cliStore, { mode: 0o700 });
      const operatorEnv = {
        BACKUP_TOOLS_DIRECTORY:
          process.env.BACKUP_TOOLS_DIRECTORY ?? privateDirectory,
        TEST_POSTGRES_BIN: process.env.TEST_POSTGRES_BIN,
        BACKUP_QA_POSTGRES_CONTAINER: process.env.BACKUP_QA_POSTGRES_CONTAINER,
        BACKUP_QA_SOURCE_URL: f.pool.options.connectionString,
        TEST_DATABASE_URL: process.env.TEST_DATABASE_URL,
        BACKUP_QA_STORE_DIRECTORY: cliStore,
        BACKUP_SOURCE_COMMIT: manifestOptions.sourceCommit,
        BACKUP_AGE_RECIPIENT: recipient,
        BACKUP_AGE_KEY_VERSION: manifestOptions.keyVersion,
        BACKUP_SUPPRESSION_KEY_VERSION: manifestOptions.suppressionKeyVersion,
        BETTER_AUTH_SECRET: f.keys.authSecret,
        DELETION_SUPPRESSION_SECRET: f.keys.suppressionSecret,
        BACKUP_VERIFY_SUPPRESSION_SECRET: f.keys.suppressionSecret,
      };
      const receipt = (result: Awaited<ReturnType<typeof runBackupCli>>) => {
        assert.ok('package' in result && typeof result.package === 'string');
        assert.ok(
          'manifestCiphertextSha256' in result &&
            typeof result.manifestCiphertextSha256 === 'string',
        );
        return {
          file: join(result.package, 'manifest.age'),
          hash: result.manifestCiphertextSha256,
        };
      };
      const postgresReceipt = receipt(
        await runBackupCli(['qa-backup'], operatorEnv),
      );
      const key = id();
      assert.equal((await f.request(a.cookie, key)).statusCode, 202);
      await f.purge(key);
      const registryFile = join(privateDirectory, 'suppressions.json');
      const cliEnv = {
        DATABASE_URL: f.pool.options.connectionString,
        BETTER_AUTH_SECRET: f.keys.authSecret,
        DELETION_SUPPRESSION_SECRET: f.keys.suppressionSecret,
      };
      const invoke = async (action: 'export' | 'apply', env = cliEnv) => {
        return registryCli(action, env.DATABASE_URL, registryFile, {
          authSecret: env.BETTER_AUTH_SECRET,
          suppressionSecret: env.DELETION_SUPPRESSION_SECRET,
        });
      };
      await invoke('export');
      const latestIdentity = join(
        privateDirectory,
        'ephemeral-latest-registry-identity',
      );
      const latestRecipient = await ephemeralIdentity(
        encryptionTools,
        latestIdentity,
      );
      const latestSourceCommit = '5222ee82437dcff1c5e5a691c466ddf5eaebfe7e';
      const latestKeyVersion = 'ephemeral-registry-rotation';
      const suppressionReceipt = receipt(
        await runBackupCli(['qa-suppressions'], {
          ...operatorEnv,
          BACKUP_SOURCE_COMMIT: latestSourceCommit,
          BACKUP_AGE_KEY_VERSION: latestKeyVersion,
          BACKUP_AGE_RECIPIENT: latestRecipient,
        }),
      );
      const recoveryEnv = {
        ...operatorEnv,
        BACKUP_SOURCE_COMMIT: undefined,
        BACKUP_AGE_KEY_VERSION: undefined,
        BACKUP_AGE_RECIPIENT: undefined,
        BACKUP_POSTGRES_SOURCE_COMMIT: manifestOptions.sourceCommit,
        BACKUP_POSTGRES_AGE_KEY_VERSION: manifestOptions.keyVersion,
        BACKUP_POSTGRES_AGE_IDENTITY_FILE: identity,
        BACKUP_SUPPRESSIONS_SOURCE_COMMIT: latestSourceCommit,
        BACKUP_SUPPRESSIONS_AGE_KEY_VERSION: latestKeyVersion,
        BACKUP_SUPPRESSIONS_AGE_IDENTITY_FILE: latestIdentity,
        BACKUP_POSTGRES_MANIFEST_FILE: postgresReceipt.file,
        BACKUP_POSTGRES_MANIFEST_SHA256: postgresReceipt.hash,
        BACKUP_SUPPRESSIONS_MANIFEST_FILE: suppressionReceipt.file,
        BACKUP_SUPPRESSIONS_MANIFEST_SHA256: suppressionReceipt.hash,
      };
      await t.test(
        'real QA CLI rejects untrusted descriptor and wrong custody key before restore',
        async () => {
          await assert.rejects(
            runBackupCli(['qa-recover'], {
              ...recoveryEnv,
              BACKUP_POSTGRES_MANIFEST_SHA256: '0'.repeat(64),
            }),
            /custodied descriptor/,
          );
          await assert.rejects(
            runBackupCli(['qa-recover'], {
              ...recoveryEnv,
              DELETION_SUPPRESSION_SECRET:
                'fictional-wrong-key-with-valid-length',
            }),
            /trusted original/,
          );
          await assert.rejects(
            runBackupCli(['qa-recover'], {
              ...recoveryEnv,
              BACKUP_SUPPRESSIONS_SOURCE_COMMIT: manifestOptions.sourceCommit,
            }),
            /origin or custody/,
          );
          await assert.rejects(
            runBackupCli(['qa-recover'], {
              ...recoveryEnv,
              BACKUP_SUPPRESSIONS_AGE_KEY_VERSION: manifestOptions.keyVersion,
            }),
            /origin or custody/,
          );
        },
      );
      await t.test(
        'real QA CLI restores an old backup with the latest registry across independent commits and age rotations',
        async () => {
          const result = await runBackupCli(
            ['qa-recover'],
            recoveryEnv,
            undefined,
            withProvisioningGate,
          );
          assert.deepEqual(result, {
            status: 'SYNTHETIC_RECOVERY_VERIFIED',
            retainedDatabase: false,
          });
        },
      );
      const registryCipher = join(privateDirectory, 'suppressions.age');
      const registryManifest = manifestFor(
        'deletion-suppressions',
        recipient,
        await encryptFile(
          encryptionTools,
          registryFile,
          registryCipher,
          recipient,
        ),
        manifestOptions,
      );
      const registryDownload = join(
        privateDirectory,
        'suppressions.download.age',
      );
      await verifiedUpload(
        transport,
        registryManifest,
        registryCipher,
        registryDownload,
      );
      const independentRegistry = join(
        privateDirectory,
        'independent-suppressions.json',
      );
      await decryptFile(
        encryptionTools,
        registryDownload,
        independentRegistry,
        identity,
      );
      assert.equal(
        await readFile(independentRegistry, 'utf8'),
        await readFile(registryFile, 'utf8'),
      );
      const registry = decodeRegistry(
        JSON.parse(await readFile(registryFile, 'utf8')),
      );
      assert.equal(registry.identifiers.length, 1);
      assert.equal(
        JSON.stringify(registry).includes(a.authenticated.user.id),
        false,
      );
      assert.equal(JSON.stringify(registry).includes(a.email), false);
      assert.equal(
        JSON.stringify(registry).includes(f.keys.suppressionSecret),
        false,
      );
      assert.ok(process.env.TEST_DATABASE_URL);
      await withRecoveryDatabase(
        process.env.TEST_DATABASE_URL,
        f.pool.options.connectionString,
        async (owned) => {
          const restored = owned.pool;
          assert.ok(restored.options.connectionString);
          const recoveryTools = await pgTools(
            owned.connectionString,
            pgOptions,
          );
          await t.test(
            'existing destination is refused and is never dropped',
            async () => {
              const name = new URL(owned.connectionString).pathname.slice(1);
              await assert.rejects(
                withRecoveryDatabase(
                  process.env.TEST_DATABASE_URL!,
                  f.pool.options.connectionString!,
                  async () => assert.fail('Existing DB must not be reused'),
                  withProvisioningGate,
                  name,
                ),
              );
              assert.equal(
                (await restored.query('SELECT current_database() AS name'))
                  .rows[0].name,
                name,
              );
            },
          );
          await t.test('source destination is refused', async () => {
            await assert.rejects(
              withRecoveryDatabase(
                process.env.TEST_DATABASE_URL!,
                owned.connectionString,
                async () => assert.fail('Source must not be restored over'),
                withProvisioningGate,
                new URL(owned.connectionString).pathname.slice(1),
              ),
              /source/,
            );
          });
          await t.test(
            'interrupted restore leaves newly allocated destination empty',
            async () => {
              const controller = new AbortController();
              controller.abort();
              await assert.rejects(
                recoveryTools.restore(
                  decrypted,
                  owned,
                  f.pool.options.connectionString!,
                  controller.signal,
                ),
                /interrupted/,
              );
              assert.equal(
                (
                  await restored.query(
                    "SELECT tablename FROM pg_tables WHERE schemaname='public'",
                  )
                ).rowCount,
                0,
              );
            },
          );
          await recoveryTools.restore(
            decrypted,
            owned,
            f.pool.options.connectionString!,
          );
          assert.equal(digest(await snapshot(restored)), digest(before));
          const replayBefore = digest(await snapshot(restored));
          const replay = await createCommandExecutor(createDatabase(restored))({
            context: b.context,
            command: bHistory.zero,
            payloadHash: commandFingerprint(
              b.context.inventory.id,
              bHistory.zero,
            ),
            requestId: 'recovery-durable-replay',
            execute: async () =>
              assert.fail(
                'Restored receipt must prevent a second executor mutation.',
              ),
          });
          assert.equal(replay.status, 'ACCEPTED');
          assert.equal(digest(await snapshot(restored)), replayBefore);
          await assert.rejects(
            restored.query(
              'UPDATE inventory_states SET last_movement_id=$1 WHERE product_id=$2',
              [id(), precision.payload.productId],
            ),
            { code: '23503' },
          );
          const money = (
            await restored.query(
              'SELECT regular_sale_price_units::text,unit_cost_units::text FROM products p JOIN inventory_states s ON s.product_id=p.id AND s.inventory_id=p.inventory_id WHERE p.id=$1',
              [precision.payload.productId],
            )
          ).rows[0];
          assert.equal(money.regular_sale_price_units, '9007199254740991');
          assert.equal(money.unit_cost_units, '1234567');
          const ready = createReadinessCheck(restored.options.connectionString);
          t.after(() => ready.close());
          assert.equal(await ready.check(), true);
          const exact = (
            await restored.query(
              'SELECT metadata_revision::text,state_revision::text FROM products p JOIN inventory_states s ON s.product_id=p.id AND s.inventory_id=p.inventory_id WHERE p.id=$1',
              [history.archived.payload.productId],
            )
          ).rows[0];
          assert.equal(exact.metadata_revision, '9007199254740992');
          assert.equal(exact.state_revision, '9007199254740992');
          assert.equal(
            (
              await restored.query(
                'SELECT unit_cost_units FROM inventory_states WHERE product_id=$1',
                [history.zero.payload.productId],
              )
            ).rows[0].unit_cost_units,
            '0',
          );
          assert.equal(
            (
              await restored.query(
                'SELECT unit_cost_units FROM inventory_states WHERE product_id=$1',
                [history.unknown.payload.productId],
              )
            ).rows[0].unit_cost_units,
            null,
          );
          assert.ok(
            (await restored.query("SELECT id FROM sales WHERE status='VOIDED'"))
              .rowCount,
          );
          assert.ok(
            (
              await restored.query(
                "SELECT id FROM purchases WHERE status='VOIDED'",
              )
            ).rowCount,
          );
          assert.ok(
            (await restored.query('SELECT id FROM products WHERE is_archived'))
              .rowCount,
          );
          assert.ok(
            (
              await restored.query(
                'SELECT operation_id FROM operation_receipts',
              )
            ).rowCount,
          );
          assert.ok(
            (await restored.query('SELECT revision FROM inventory_change_sets'))
              .rowCount,
          );
          const restoredEnv = {
            ...cliEnv,
            DATABASE_URL: restored.options.connectionString,
          };
          const recovered = async () => {
            const remaining = (
              await restored.query<{ id: string }>('SELECT id FROM "user"')
            ).rows;
            return remaining.every(
              (row) =>
                !registry.identifiers.includes(
                  suppressionIdentifier(f.keys.suppressionSecret, row.id),
                ),
            );
          };
          const wrongBefore = digest(await snapshot(restored));
          const independentEvidence = await captureRecoveryEvidence(
            restored,
            registry,
            f.keys.suppressionSecret,
          );
          await invoke('apply', {
            ...restoredEnv,
            DELETION_SUPPRESSION_SECRET:
              'fictional-dev02-wrong-key-valid-length',
          });
          // API-10's format does not authenticate the key. Exit0 and schema readiness
          // alone never certify recovery. The known deleted identity is still present.
          assert.equal(digest(await snapshot(restored)), wrongBefore);
          assert.equal(await recovered(), false);
          await t.test(
            'wrong HMAC exit0 and reappearing deleted identity fail independent verification',
            async () => {
              await assert.rejects(
                verifyRecoveryEvidence(restored, independentEvidence),
                /Suppressed identity/,
              );
            },
          );
          assert.equal(await ready.check(), true);
          await invoke('apply', restoredEnv);
          assert.equal(await recovered(), true);
          await verifyRecoveryEvidence(restored, independentEvidence);
          await t.test(
            'surviving auth data loss prevents recovery acceptance',
            async () => {
              const transaction = await restored.connect();
              await transaction.query('BEGIN');
              try {
                await transaction.query(
                  'DELETE FROM session WHERE user_id=$1',
                  [b.authenticated.user.id],
                );
                await assert.rejects(
                  verifyRecoveryEvidence(transaction, independentEvidence),
                  /Surviving account data/,
                );
              } finally {
                await transaction.query('ROLLBACK');
                transaction.release();
              }
              await verifyRecoveryEvidence(restored, independentEvidence);
            },
          );
          assert.equal(
            (
              await restored.query('SELECT id FROM "user" WHERE id=$1', [
                a.authenticated.user.id,
              ])
            ).rowCount,
            0,
          );
          assert.equal(
            await survivor(
              restored,
              b.authenticated.user.id,
              b.context.inventory.id,
            ),
            bBefore,
          );
          const after = digest(await snapshot(restored));
          await invoke('apply', restoredEnv);
          assert.equal(digest(await snapshot(restored)), after);
          assert.equal(await ready.check(), true);
          const restoredDatabase = createDatabase(restored);
          const restoredAuth = createAuth({
            database: restoredDatabase,
            config: f.config,
            emailSender: {
              async send() {
                assert.fail('Recovery reads must not send email.');
              },
            },
          });
          t.after(() => restoredAuth.drainEmails());
          const authenticated = await resolveAuthenticatedUser(
            restoredAuth.auth,
            {
              cookie: b.cookie,
            },
          );
          assert.equal(authenticated.user.id, b.authenticated.user.id);
          assert.equal(authenticated.user.emailVerified, true);
          const own = await resolveCloudInventory(
            restoredDatabase,
            authenticated,
            b.context.inventory.id,
          );
          assert.equal(own.business.id, b.context.business.id);
          assert.equal(own.inventory.id, b.context.inventory.id);
          await assert.rejects(
            resolveCloudInventory(
              restoredDatabase,
              authenticated,
              a.context.inventory.id,
            ),
            { statusCode: 404, code: 'NOT_FOUND' },
          );
          await assert.rejects(
            resolveAuthenticatedUser(restoredAuth.auth, { cookie: a.cookie }),
            { statusCode: 401, code: 'UNAUTHENTICATED' },
          );
          assert.equal(
            (
              await f.pool.query('SELECT id FROM "user" WHERE id=$1', [
                a.authenticated.user.id,
              ])
            ).rowCount,
            0,
          );
          assert.equal(
            await survivor(
              f.pool,
              b.authenticated.user.id,
              b.context.inventory.id,
            ),
            bBefore,
          );
        },
        withProvisioningGate,
      );
    });
  },
);
