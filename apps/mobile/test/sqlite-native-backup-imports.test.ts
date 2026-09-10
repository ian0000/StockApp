import assert from 'node:assert/strict';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

const localRequire = createRequire(import.meta.url);
// Use Expo's installed Metro resolver, not Node's platform-blind resolution.
const metroRequire = createRequire(localRequire.resolve('expo/metro-config'));
const metro: {
  resolve(
    context: object,
    specifier: string,
    platform: string,
  ): { type: string; filePath: string };
} = metroRequire('metro-resolver');

function loadNativeAdapter(entry: string, platform: string) {
  const loading = new Set<string>();
  const cache = new Map<string, Record<string, unknown>>();

  function load(filePath: string): Record<string, unknown> {
    assert.ok(!loading.has(filePath), `Require cycle: ${filePath}`);
    const cached = cache.get(filePath);
    if (cached) return cached;
    loading.add(filePath);
    const module = { exports: {} as Record<string, unknown> };
    const source = ts.transpileModule(readFileSync(filePath, 'utf8'), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    }).outputText;
    runInNewContext(
      source,
      {
        module,
        exports: module.exports,
        require: (specifier: string): unknown => {
          // Composition must not access the native driver or write to SQLite.
          if (specifier === 'drizzle-orm/expo-sqlite') {
            return {
              drizzle: () =>
                assert.fail('Unexpected database access during composition'),
            };
          }
          if (!specifier.startsWith('.')) return localRequire(specifier);
          const resolution = metro.resolve(
            {
              originModulePath: filePath,
              preferNativePlatform: true,
              sourceExts: ['ts', 'tsx', 'js', 'json'],
              assetExts: new Set(),
              mainFields: ['react-native', 'browser', 'main'],
              getPackageForModule: () => null,
              fileSystemLookup: (path: string) =>
                existsSync(path)
                  ? {
                      exists: true,
                      type: statSync(path).isDirectory() ? 'd' : 'f',
                      realPath: path,
                    }
                  : { exists: false },
            },
            specifier,
            platform,
          );
          assert.equal(resolution.type, 'sourceFile');
          return load(resolution.filePath);
        },
      },
      { filename: filePath },
    );
    loading.delete(filePath);
    cache.set(filePath, module.exports);
    return module.exports;
  }

  return load(
    resolve(import.meta.dirname, '../src/infrastructure/sqlite', entry),
  );
}

for (const platform of ['ios', 'android']) {
  for (const [file, factoryName, method] of [
    [
      'backup-restore-transaction.native.ts',
      'createSqliteBackupRestoreTransaction',
      'replace',
    ],
    [
      'backup-snapshot-reader.native.ts',
      'createSqliteBackupSnapshotReader',
      'readSnapshot',
    ],
  ]) {
    test(`${platform}: ${factoryName} imports and composes without cycles or database access`, () => {
      const factory = loadNativeAdapter(file, platform)[factoryName];
      assert.equal(typeof factory, 'function');
      if (typeof factory !== 'function') assert.fail('Missing native factory');
      const adapter = factory({ sqlite: {} });
      assert.equal(typeof adapter[method], 'function');
    });
  }
}
