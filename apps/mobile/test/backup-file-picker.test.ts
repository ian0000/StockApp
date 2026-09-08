import assert from 'node:assert/strict';
import test from 'node:test';

import { createBackupFilePicker } from '../src/infrastructure/backup/backup-file-picker';

test('picker cancellation is a normal no-op without reading or deleting', async () => {
  let reads = 0;
  let deletes = 0;
  const picker = createBackupFilePicker({
    async pickDocument() {
      return { canceled: true };
    },
    async readTemporaryFile() {
      reads += 1;
      return '';
    },
    deleteTemporaryFile() {
      deletes += 1;
    },
  });

  assert.equal(await picker.pick(), null);
  assert.equal(reads, 0);
  assert.equal(deletes, 0);
});

test('reads a selected copied file as text and removes only the temporary copy', async () => {
  const reads: string[] = [];
  const deletes: string[] = [];
  const picker = createBackupFilePicker({
    async pickDocument() {
      return {
        canceled: false,
        asset: { name: 'backup.json', uri: 'cache://copy.json' },
      };
    },
    async readTemporaryFile(uri) {
      reads.push(uri);
      return '{"format":"stockapp-backup"}';
    },
    deleteTemporaryFile(uri) {
      deletes.push(uri);
    },
  });

  assert.deepEqual(await picker.pick(), {
    name: 'backup.json',
    contents: '{"format":"stockapp-backup"}',
  });
  assert.deepEqual(reads, ['cache://copy.json']);
  assert.deepEqual(deletes, ['cache://copy.json']);
});

test('cleans the copied file and propagates a read failure', async () => {
  const failure = new Error('read failed');
  const deletes: string[] = [];
  const picker = createBackupFilePicker({
    async pickDocument() {
      return {
        canceled: false,
        asset: { name: 'backup.json', uri: 'cache://copy.json' },
      };
    },
    async readTemporaryFile() {
      throw failure;
    },
    deleteTemporaryFile(uri) {
      deletes.push(uri);
    },
  });

  await assert.rejects(picker.pick(), failure);
  assert.deepEqual(deletes, ['cache://copy.json']);
});
