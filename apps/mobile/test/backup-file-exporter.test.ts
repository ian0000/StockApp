import assert from 'node:assert/strict';
import test from 'node:test';

import type { BackupArtifact } from '@stock-app/application';

import { createBackupFileExporter } from '../src/infrastructure/backup/backup-file-exporter';

const ARTIFACT: BackupArtifact = {
  fileName: 'stockapp-backup-2026-09-07-143000.json',
  mimeType: 'application/json',
  contents: '{"format":"stockapp-backup"}\n',
  metadata: {
    format: 'stockapp-backup',
    formatVersion: 1,
    createdAt: 1_788_791_400_123,
    inventoryId: 'inventory-1',
  },
};

test('writes the complete artifact before sharing it and removes only the temporary file', async () => {
  const calls: string[] = [];
  const exporter = createBackupFileExporter({
    createTemporaryFile(fileName) {
      calls.push(`create:${fileName}`);
      return {
        uri: `cache://${fileName}`,
        write(contents) {
          calls.push(`write:${contents}`);
        },
        delete() {
          calls.push('delete');
        },
      };
    },
    async isSharingAvailable() {
      calls.push('available');
      return true;
    },
    async share(uri, options) {
      calls.push(`share:${uri}:${options.mimeType}:${options.UTI}`);
    },
  });

  await exporter.export(ARTIFACT);

  assert.deepEqual(calls, [
    'available',
    `create:${ARTIFACT.fileName}`,
    `write:${ARTIFACT.contents}`,
    `share:cache://${ARTIFACT.fileName}:application/json:public.json`,
    'delete',
  ]);
});

test('deletes the temporary file when sharing fails and propagates the failure', async () => {
  const failure = new Error('share failed');
  let deleted = false;
  const exporter = createBackupFileExporter({
    createTemporaryFile() {
      return {
        uri: 'cache://backup.json',
        write() {},
        delete() {
          deleted = true;
        },
      };
    },
    async isSharingAvailable() {
      return true;
    },
    async share() {
      throw failure;
    },
  });

  await assert.rejects(exporter.export(ARTIFACT), failure);
  assert.equal(deleted, true);
});

test('fails before creating a file when native sharing is unavailable', async () => {
  let created = false;
  const exporter = createBackupFileExporter({
    createTemporaryFile() {
      created = true;
      throw new Error('must not create');
    },
    async isSharingAvailable() {
      return false;
    },
    async share() {},
  });

  await assert.rejects(exporter.export(ARTIFACT), /not available/i);
  assert.equal(created, false);
});

test('a canceled share is treated as a completed sheet interaction, not a corrupt backup', async () => {
  let deleted = false;
  const exporter = createBackupFileExporter({
    createTemporaryFile() {
      return {
        uri: 'cache://backup.json',
        write() {},
        delete() {
          deleted = true;
        },
      };
    },
    async isSharingAvailable() {
      return true;
    },
    async share() {
      // Expo resolves normally when the native share sheet is dismissed.
    },
  });

  await exporter.export(ARTIFACT);
  assert.equal(deleted, true);
});
