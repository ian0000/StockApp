import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile, writeFile, copyFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { decodeRegistry } from '../src/deletion/registry.js';
import { privateWorkspace } from '../ops/private-files.js';
import { prepareTools, verifyTools } from '../ops/tools.js';
import { installedTools } from '../ops/cli.js';
import {
  encryptFile,
  decryptFile,
  ephemeralIdentity,
  fileDigest,
} from '../ops/encryption.js';
import { manifestFor, smokeOptIn, syntheticSmoke } from '../ops/workflow.js';
import { validateManifest, objectKey } from '../ops/manifest.js';
import {
  readR2Config,
  rcloneInvocation,
  localTransport,
  verifiedUpload,
  verifiedDownload,
  type Transport,
} from '../ops/transport.js';
import { runProcess, safeEnvironment } from '../ops/process.js';
import {
  qaDatabase,
  validatePostgresVersion,
  assertRecoveryTarget,
  pgTools,
} from '../ops/postgres.js';

test('DEV-02B operator guards, actual age and conditional S3 transport; no R2 network', async (t) => {
  await privateWorkspace(async (directory) => {
    const tools = process.env.BACKUP_TOOLS_DIRECTORY
      ? installedTools(process.env)
      : await prepareTools(directory);
    await verifyTools(tools);
    const identity = join(directory, 'identity');
    const recipient = await ephemeralIdentity(tools, identity);
    const source = join(directory, 'source');
    await writeFile(source, 'synthetic content, not customer data\n', {
      flag: 'wx',
      mode: 0o600,
    });
    const cipher = join(directory, 'cipher.age');
    const integrity = await encryptFile(tools, source, cipher, recipient);
    const manifest = manifestFor('postgres', recipient, integrity, {
      sourceCommit: '402988098caf97262ce321d3e3d5d9fe23320126',
      keyVersion: 'qa-v1',
      suppressionKeyVersion: 'qa-original',
    });
    const transport = localTransport(join(directory, 'mock-store'));
    let next = 0;
    const path = () => join(directory, `case-${next++}`);
    const config = {
      BACKUP_R2_ENDPOINT: `https://${'0'.repeat(32)}.r2.cloudflarestorage.com`,
      BACKUP_R2_BUCKET: 'stockapp-uat-backups',
      BACKUP_R2_WRITER_ACCESS_KEY: 'fictional-writer-key',
      BACKUP_R2_WRITER_SECRET_KEY: 'fictional-writer-secret-value',
      BACKUP_R2_READER_ACCESS_KEY: 'fictional-reader-key',
      BACKUP_R2_READER_SECRET_KEY: 'fictional-reader-secret-value',
    };
    const fail = async () => {
      throw new Error('Synthetic denial.');
    };
    const denied: Transport = {
      upload: fail,
      download: fail,
      deleteSmoke: fail,
    };
    await t.test('missing writer/reader credentials fail closed', () => {
      assert.throws(() => readR2Config({}), /bucket/);
      assert.throws(
        () =>
          readR2Config({ ...config, BACKUP_R2_WRITER_SECRET_KEY: undefined }),
        /credentials/,
      );
      assert.throws(
        () =>
          readR2Config({ ...config, BACKUP_R2_READER_SECRET_KEY: undefined }),
        /credentials/,
      );
    });
    await t.test('wrong bucket rejected without requests', () =>
      assert.throws(
        () => readR2Config({ ...config, BACKUP_R2_BUCKET: 'other-bucket' }),
        /bucket/,
      ),
    );
    await t.test(
      'non-R2, insecure and credential-bearing endpoints rejected',
      () => {
        for (const endpoint of [
          'http://localhost',
          'https://evil.test',
          'https://user:password@' +
            '0'.repeat(32) +
            '.r2.cloudflarestorage.com',
          'https://' +
            '0'.repeat(32) +
            '.r2.cloudflarestorage.com/?redirect=other',
        ])
          assert.throws(
            () => readR2Config({ ...config, BACKUP_R2_ENDPOINT: endpoint }),
            /HTTPS/,
          );
      },
    );
    await t.test(
      'writer and reader roles are separate and credentials absent from argv',
      () => {
        const r2 = readR2Config(config);
        const writer = rcloneInvocation(r2, 'writer');
        const reader = rcloneInvocation(r2, 'reader');
        assert.equal(
          writer.env.RCLONE_CONFIG_BACKUP_ACCESS_KEY_ID,
          config.BACKUP_R2_WRITER_ACCESS_KEY,
        );
        assert.equal(
          reader.env.RCLONE_CONFIG_BACKUP_ACCESS_KEY_ID,
          config.BACKUP_R2_READER_ACCESS_KEY,
        );
        assert.equal(
          Object.values(writer.env).includes(
            config.BACKUP_R2_READER_SECRET_KEY,
          ),
          false,
        );
        assert.equal(
          Object.values(reader.env).includes(
            config.BACKUP_R2_WRITER_SECRET_KEY,
          ),
          false,
        );
        for (const secret of [
          config.BACKUP_R2_WRITER_SECRET_KEY,
          config.BACKUP_R2_READER_SECRET_KEY,
        ])
          assert.equal(
            JSON.stringify([writer.args, reader.args]).includes(secret),
            false,
          );
        assert.throws(
          () =>
            readR2Config({
              ...config,
              BACKUP_R2_READER_ACCESS_KEY: config.BACKUP_R2_WRITER_ACCESS_KEY,
            }),
          /separate/,
        );
      },
    );
    await t.test('writer denied cannot be promoted', async () =>
      assert.rejects(verifiedUpload(denied, manifest, cipher, path())),
    );
    await t.test('reader denied cannot be promoted after upload', async () =>
      assert.rejects(
        verifiedUpload(
          { ...denied, upload: async () => {} },
          manifest,
          cipher,
          path(),
        ),
      ),
    );
    await t.test(
      'missing object fails and partial local download is removed',
      async () => {
        const output = path();
        await assert.rejects(verifiedDownload(transport, manifest, output));
        await assert.rejects(stat(output));
      },
    );
    await t.test(
      'encrypted upload retrieved independently with exact bytes',
      async () => {
        await verifiedUpload(transport, manifest, cipher, path());
        assert.equal(manifest.restoreVerification, 'NOT_VERIFIED');
      },
    );
    await t.test(
      'existing object write rejected, original bytes intact',
      async () => {
        await assert.rejects(transport.upload(manifest.objectKey, cipher));
        const output = path();
        await verifiedDownload(transport, manifest, output);
        assert.deepEqual(await fileDigest(output), integrity);
      },
    );
    await t.test('interrupted upload never becomes verified', async () => {
      const controller = new AbortController();
      controller.abort();
      await assert.rejects(
        verifiedUpload(
          transport,
          {
            ...manifest,
            backupId: '00000000-0000-4000-8000-000000000001',
            objectKey: objectKey(
              'postgres',
              '00000000-0000-4000-8000-000000000001',
            ),
          },
          cipher,
          path(),
          controller.signal,
        ),
      );
    });
    await t.test(
      'partial upload fails independent ciphertext verification',
      async () => {
        const partial: Transport = {
          ...denied,
          upload: async () => {},
          download: async (_key, file) => {
            await writeFile(file, (await readFile(cipher)).subarray(0, 40), {
              flag: 'wx',
            });
          },
        };
        await assert.rejects(
          verifiedUpload(partial, manifest, cipher, path()),
          /integrity/,
        );
      },
    );
    await t.test(
      'ciphertext checksum mismatch rejected before upload',
      async () =>
        assert.rejects(
          verifiedUpload(
            denied,
            { ...manifest, ciphertextSha256: '0'.repeat(64) },
            cipher,
            path(),
          ),
          /metadata/,
        ),
    );
    await t.test(
      'wrong download checksum fails closed and cleans local file',
      async () => {
        const output = path();
        await assert.rejects(
          verifiedDownload(
            transport,
            { ...manifest, ciphertextSha256: '0'.repeat(64) },
            output,
          ),
          /integrity/,
        );
        await assert.rejects(stat(output));
      },
    );
    await t.test(
      'correct identity decrypts exact synthetic bytes',
      async () => {
        const output = path();
        await decryptFile(tools, cipher, output, identity);
        assert.deepEqual(await readFile(output), await readFile(source));
      },
    );
    await t.test(
      'wrong age identity fails without retaining plaintext',
      async () => {
        const other = path();
        await ephemeralIdentity(tools, other);
        const output = path();
        await assert.rejects(
          decryptFile(tools, cipher, output, other),
          /decryption/,
        );
        await assert.rejects(stat(output));
      },
    );
    await t.test(
      'missing identity fails without retaining plaintext',
      async () => {
        const output = path();
        await assert.rejects(decryptFile(tools, cipher, output, path()));
        await assert.rejects(stat(output));
      },
    );
    await t.test(
      'corrupt authenticated age ciphertext fails without plaintext residue',
      async () => {
        const corrupt = path();
        const bytes = await readFile(cipher);
        bytes[bytes.length - 1] ^= 1;
        await writeFile(corrupt, bytes);
        const output = path();
        await assert.rejects(
          decryptFile(tools, corrupt, output, identity),
          /decryption/,
        );
        await assert.rejects(stat(output));
      },
    );
    await t.test(
      'interrupted encryption and decryption close output handles and remove partial files',
      async () => {
        const controller = new AbortController();
        controller.abort();
        for (const action of ['encrypt', 'decrypt']) {
          const output = path();
          await assert.rejects(
            action === 'encrypt'
              ? encryptFile(tools, source, output, recipient, controller.signal)
              : decryptFile(tools, cipher, output, identity, controller.signal),
          );
          await assert.rejects(stat(output));
        }
      },
    );
    await t.test(
      'invalid recipient configuration and checksum rejected',
      async () => {
        await assert.rejects(
          encryptFile(tools, source, path(), 'ssh-rsa incorrect'),
          /X25519/,
        );
        await assert.rejects(
          encryptFile(
            tools,
            source,
            path(),
            recipient.slice(0, -1) + (recipient.endsWith('q') ? 'p' : 'q'),
          ),
          /encryption/,
        );
      },
    );
    await t.test(
      'existing encryption/decryption output is never overwritten',
      async () => {
        const output = path();
        await writeFile(output, 'preserve');
        await assert.rejects(encryptFile(tools, source, output, recipient));
        await assert.rejects(decryptFile(tools, cipher, output, identity));
        assert.equal(await readFile(output, 'utf8'), 'preserve');
      },
    );
    await t.test('plaintext upload blocked', async () =>
      assert.rejects(
        transport.upload(objectKey('postgres'), source),
        /Plaintext/,
      ),
    );
    await t.test('empty/incomplete/unexpected metadata rejected', () => {
      for (const input of [
        null,
        {},
        { ...manifest, keyVersion: '' },
        { ...manifest, encryptedBytes: 0 },
        { ...manifest, privateKey: 'forbidden' },
        { ...manifest, suppressionIdentifiers: [] },
      ])
        assert.throws(() => validateManifest(input));
    });
    await t.test(
      'bad suppression registry refuses shape and unexpected fields',
      () => {
        for (const value of [
          {},
          {
            format: 'stockapp-deletion-suppressions',
            version: 1,
            identifiers: ['not-a-hmac'],
          },
          {
            format: 'stockapp-deletion-suppressions',
            version: 1,
            identifiers: [],
            userId: 'forbidden',
          },
        ])
          assert.throws(() => decodeRegistry(value));
      },
    );
    await t.test(
      'manifest identity, origin, version and retention strict',
      () => {
        for (const input of [
          { ...manifest, objectKey: objectKey('qa-smoke') },
          { ...manifest, environment: 'prod' },
          { ...manifest, sourceCommit: 'main' },
          { ...manifest, postgresServerVersion: '18.5' },
          { ...manifest, retentionPolicy: 'fixed-37-days' },
        ])
          assert.throws(() => validateManifest(input));
      },
    );
    await t.test(
      'raw identity/path traversal cannot enter object names',
      async () => {
        for (const key of [
          'uat/postgres/../private',
          'other/object',
          'uat/qa-smoke/user@example.test',
        ])
          await assert.rejects(transport.upload(key, cipher));
      },
    );
    await t.test('PG incompatible client versions fail', () => {
      for (const version of [
        'pg_dump (PostgreSQL) 17.8',
        'pg_dump (PostgreSQL) 18.5',
        'pg_dump (PostgreSQL) 18.6 arbitrary',
      ])
        assert.throws(() => validatePostgresVersion('pg_dump', version));
      validatePostgresVersion('pg_dump', 'pg_dump (PostgreSQL) 18.6');
    });
    await t.test('unavailable PostgreSQL binary fails sanitized', async () => {
      await assert.rejects(
        pgTools('postgresql://postgres@127.0.0.1:65437/stockapp_test_owned', {
          bin: join(directory, 'missing-tools'),
        }),
        /diagnostics withheld/,
      );
    });
    await t.test(
      'explicit PG binary choice remains authoritative in GitHub CI',
      async () => {
        const previous = process.env.GITHUB_ACTIONS;
        process.env.GITHUB_ACTIONS = 'true';
        try {
          await assert.rejects(
            pgTools(
              'postgresql://postgres@127.0.0.1:65437/stockapp_test_owned',
              { bin: join(directory, 'missing-explicit-bin') },
            ),
            /diagnostics withheld/,
          );
        } finally {
          if (previous === undefined) delete process.env.GITHUB_ACTIONS;
          else process.env.GITHUB_ACTIONS = previous;
        }
      },
    );
    await t.test(
      'invalid/non-local/query-option/source targets rejected',
      () => {
        for (const url of [
          'postgresql://postgres@remote.test/stockapp_test_source',
          'postgresql://postgres@localhost/prod',
          'postgresql://postgres@localhost/stockapp_test_source?host=remote',
          'postgresql://postgres@localhost/stockapp_test',
        ])
          assert.throws(() => qaDatabase(url));
        const sourceUrl =
          'postgresql://postgres@localhost/stockapp_test_source';
        assert.throws(
          () =>
            assertRecoveryTarget(
              { connectionString: sourceUrl, pool: {} as never },
              sourceUrl,
            ),
          /newly created/,
        );
      },
    );
    await t.test('secret child output/errors never escape', async () => {
      const secret = 'synthetic-test-secret-not-for-output';
      try {
        await runProcess(
          process.execPath,
          [
            '-e',
            'console.error(process.env.QA_SECRET); console.log(process.env.QA_SECRET); process.exit(1)',
          ],
          { env: safeEnvironment({ QA_SECRET: secret }) },
        );
        assert.fail('Expected failure');
      } catch (error) {
        assert.ok(error instanceof Error);
        assert.equal(error.message.includes(secret), false);
        assert.equal(error.message.includes('QA_SECRET'), false);
      }
    });
    await t.test(
      'remote smoke needs explicit opt-in; never enabled by default',
      () => {
        for (const args of [[], ['qa-backup'], ['--remote-smoke', 'extra']])
          assert.throws(() => smokeOptIn(args), /explicit/);
      },
    );
    await t.test(
      'delete outside smoke prefix or another allocation forbidden',
      async () => {
        await assert.rejects(
          transport.deleteSmoke(manifest.objectKey, manifest.objectKey),
          /authorized/,
        );
        await assert.rejects(
          transport.deleteSmoke(objectKey('qa-smoke'), objectKey('qa-smoke')),
          /allocation/,
        );
        const unowned = objectKey('qa-smoke');
        await assert.rejects(
          transport.deleteSmoke(unowned, unowned),
          /not allocated/,
        );
      },
    );
    await t.test(
      'smoke with ephemeral identity writes exactly one allocated ciphertext and cleans only it',
      async () => {
        let uploads = 0,
          downloads = 0,
          deletes = 0;
        const count: Transport = {
          upload: async (...args) => {
            uploads++;
            await transport.upload(...args);
          },
          download: async (...args) => {
            downloads++;
            await transport.download(...args);
          },
          deleteSmoke: async (...args) => {
            deletes++;
            await transport.deleteSmoke(...args);
          },
        };
        const result = await syntheticSmoke(
          tools,
          count,
          manifest.sourceCommit,
        );
        assert.equal(result.status, 'PASS');
        assert.match(result.objectKey, /^uat\/qa-smoke\//);
        assert.deepEqual([uploads, downloads, deletes], [1, 1, 1]);
        await verifiedDownload(transport, manifest, path());
      },
    );
    await t.test(
      'private workspace cleans after success, failure and interruption',
      async () => {
        for (const failed of [false, true]) {
          let allocated = '';
          const operation = privateWorkspace(async (folder) => {
            allocated = folder;
            await writeFile(join(folder, 'private'), 'synthetic');
            if (failed) throw new Error('interrupted');
          });
          if (failed) await assert.rejects(operation);
          else await operation;
          await assert.rejects(stat(allocated));
        }
      },
    );
    await t.test('repository plaintext workspace rejected', async () =>
      assert.rejects(
        privateWorkspace(async () => {}, process.cwd()),
        /repository/,
      ),
    );
    await t.test(
      'actual rclone conditional PUT and multipart completion close overwrite race',
      async () => {
        const stored = new Map<
          string,
          { bytes: Buffer; etag: string; mtime: string }
        >();
        let race = false;
        let putCondition = false;
        let completeCondition = false;
        let writerSeen = false;
        let readerSeen = false;
        const uploads = new Map<
          string,
          { key: string; bytes?: Buffer; etag?: string }
        >();
        let uploadNumber = 0;
        const server = createServer(async (request, response) => {
          const key = request.url?.split('?')[0] ?? '';
          const query = new URL(request.url ?? '/', 'http://localhost')
            .searchParams;
          const authorization = request.headers.authorization ?? '';
          if (authorization.includes(config.BACKUP_R2_WRITER_ACCESS_KEY))
            writerSeen = true;
          if (authorization.includes(config.BACKUP_R2_READER_ACCESS_KEY))
            readerSeen = true;
          const value = stored.get(key);
          if (request.method === 'GET' && query.get('list-type') === '2') {
            const prefix = query.get('prefix') ?? '';
            assert.equal(
              prefix,
              manifest.objectKey.slice(
                0,
                manifest.objectKey.lastIndexOf('/') + 1,
              ),
            );
            const contents = [...stored.entries()]
              .filter(([object]) =>
                object.replace('/stockapp-uat-backups/', '').startsWith(prefix),
              )
              .map(
                ([object, item]) =>
                  `<Contents><Key>${encodeURIComponent(object.replace('/stockapp-uat-backups/', ''))}</Key><LastModified>${new Date(item.mtime).toISOString()}</LastModified><ETag>${item.etag}</ETag><Size>${item.bytes.length}</Size><StorageClass>STANDARD</StorageClass></Contents>`,
              )
              .join('');
            response
              .writeHead(200, { 'content-type': 'application/xml' })
              .end(
                `<ListBucketResult><Name>stockapp-uat-backups</Name><Prefix>${encodeURIComponent(prefix)}</Prefix><EncodingType>url</EncodingType><IsTruncated>false</IsTruncated>${contents}</ListBucketResult>`,
              );
            return;
          }
          if (request.method === 'POST' && query.has('uploads')) {
            const uploadId = String(++uploadNumber);
            uploads.set(uploadId, { key });
            response
              .writeHead(200, { 'content-type': 'application/xml' })
              .end(
                `<InitiateMultipartUploadResult><Bucket>stockapp-uat-backups</Bucket><Key>${key.replace('/stockapp-uat-backups/', '')}</Key><UploadId>${uploadId}</UploadId></InitiateMultipartUploadResult>`,
              );
            return;
          }
          if (query.has('uploadId')) {
            const uploadId = query.get('uploadId')!;
            const pending = uploads.get(uploadId);
            if (request.method === 'DELETE') {
              uploads.delete(uploadId);
              response.writeHead(204).end();
              return;
            }
            if (!pending) {
              response.writeHead(404).end();
              return;
            }
            if (request.method === 'PUT') {
              const chunks: Buffer[] = [];
              for await (const chunk of request)
                chunks.push(Buffer.from(chunk));
              pending.bytes = Buffer.concat(chunks);
              pending.etag =
                '"' +
                createHash('md5').update(pending.bytes).digest('hex') +
                '"';
              response.writeHead(200, { etag: pending.etag }).end();
              return;
            }
            if (request.method === 'POST') {
              completeCondition = request.headers['if-none-match'] === '*';
              if (value && completeCondition) {
                response.writeHead(412).end();
                return;
              }
              if (!pending.bytes || !pending.etag) {
                response.writeHead(400).end();
                return;
              }
              const etag =
                '"' +
                createHash('md5')
                  .update(Buffer.from(pending.etag.replaceAll('"', ''), 'hex'))
                  .digest('hex') +
                '-1"';
              stored.set(key, {
                bytes: pending.bytes,
                etag,
                mtime: new Date().toUTCString(),
              });
              uploads.delete(uploadId);
              response
                .writeHead(200, { 'content-type': 'application/xml' })
                .end(
                  `<CompleteMultipartUploadResult><Location>http://localhost/</Location><Bucket>stockapp-uat-backups</Bucket><Key>${key.replace('/stockapp-uat-backups/', '')}</Key><ETag>${etag}</ETag></CompleteMultipartUploadResult>`,
                );
              return;
            }
          }
          if (request.method === 'HEAD') {
            if (!value || race) {
              response.writeHead(404).end();
              return;
            }
            response
              .writeHead(200, {
                'content-length': value.bytes.length,
                etag: value.etag,
                'last-modified': value.mtime,
                'x-amz-meta-mtime': '0',
              })
              .end();
            return;
          }
          if (request.method === 'PUT') {
            putCondition = request.headers['if-none-match'] === '*';
            if (value && putCondition) {
              response.writeHead(412).end();
              return;
            }
            const chunks: Buffer[] = [];
            for await (const chunk of request) chunks.push(Buffer.from(chunk));
            const bytes = Buffer.concat(chunks);
            const etag =
              '"' + createHash('md5').update(bytes).digest('hex') + '"';
            stored.set(key, { bytes, etag, mtime: new Date().toUTCString() });
            response.writeHead(200, { etag }).end();
            return;
          }
          if (request.method === 'GET' && value) {
            response
              .writeHead(200, {
                'content-length': value.bytes.length,
                etag: value.etag,
              })
              .end(value.bytes);
            return;
          }
          response.writeHead(404).end();
        });
        await new Promise<void>((resolve) =>
          server.listen(0, '127.0.0.1', resolve),
        );
        try {
          const address = server.address();
          assert.ok(address && typeof address !== 'string');
          const writer = rcloneInvocation(readR2Config(config), 'writer');
          writer.env.RCLONE_CONFIG_BACKUP_ENDPOINT = `http://127.0.0.1:${address.port}`;
          const remote = `backup:stockapp-uat-backups/${manifest.objectKey}`;
          const args = [
            'copyto',
            cipher,
            remote,
            ...writer.args,
            '--immutable',
            '--error-on-no-transfer',
            '--no-traverse',
            '--header-upload',
            'If-None-Match: *',
          ];
          await runProcess(tools.rclone, args, { env: writer.env });
          assert.equal(putCondition, true);
          assert.equal(writerSeen, true);
          const before = stored.values().next().value?.bytes;
          assert.deepEqual(before, await readFile(cipher));
          race = true;
          await assert.rejects(
            runProcess(tools.rclone, args, { env: writer.env }),
          );
          assert.deepEqual(stored.values().next().value?.bytes, before);
          race = false;
          const multipartRemote = `backup:stockapp-uat-backups/${objectKey('postgres')}`;
          const multipartArgs = [...args];
          multipartArgs[2] = multipartRemote;
          multipartArgs.push('--s3-upload-cutoff', '0');
          await runProcess(tools.rclone, multipartArgs, { env: writer.env });
          assert.equal(completeCondition, true);
          const multipartBefore = [...stored.values()].at(-1)?.bytes;
          assert.deepEqual(multipartBefore, await readFile(cipher));
          race = true;
          await assert.rejects(
            runProcess(tools.rclone, multipartArgs, { env: writer.env }),
          );
          assert.deepEqual([...stored.values()].at(-1)?.bytes, multipartBefore);
          race = false;
          const reader = rcloneInvocation(readR2Config(config), 'reader');
          reader.env.RCLONE_CONFIG_BACKUP_ENDPOINT =
            writer.env.RCLONE_CONFIG_BACKUP_ENDPOINT;
          const downloaded = path();
          await runProcess(tools.rclone, ['cat', remote, ...reader.args], {
            env: reader.env,
            output: createWriteStream(downloaded, { flags: 'wx', mode: 0o600 }),
          });
          assert.deepEqual(await fileDigest(downloaded), integrity);
          assert.equal(readerSeen, true);
        } finally {
          await new Promise<void>((resolve, reject) =>
            server.close((error) => (error ? reject(error) : resolve())),
          );
        }
      },
    );
    await t.test(
      'operator has no Railway/deployment/CD imports or commands',
      async () => {
        const sourceText = await readFile(
          new URL('../ops/cli.ts', import.meta.url),
          'utf8',
        );
        assert.equal(
          /accept-deploy|railway|deployLatest|cloudflare.*token/i.test(
            sourceText,
          ),
          false,
        );
      },
    );
    // Keep a separate unmodified encrypted fixture for follow-on regressions.
    await copyFile(cipher, path());
  });
});
