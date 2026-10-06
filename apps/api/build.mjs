import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { build } from 'esbuild';

async function entries(directory) {
  const paths = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    paths.map((entry) =>
      entry.isDirectory()
        ? entries(join(directory, entry.name))
        : entry.name.endsWith('.ts')
          ? [join(directory, entry.name)]
          : [],
    ),
  );
  return nested.flat();
}

// Shared chunks keep Error/Money identity stable across the compiled API modules.
// Only the existing pure workspace packages are bundled; service dependencies stay external.
await build({
  entryPoints: await entries('src'),
  outbase: 'src',
  outdir: 'dist',
  bundle: true,
  splitting: true,
  format: 'esm',
  platform: 'node',
  target: 'node22',
  plugins: [
    {
      name: 'external-service-packages',
      setup(builder) {
        // Preserve API module locations, including migration paths and executable entry-point guards.
        builder.onResolve(
          { filter: /^\.\.?\/.*\.js$/ },
          ({ path, importer }) =>
            importer.replaceAll('\\', '/').includes('/apps/api/src/')
              ? { path, external: true }
              : undefined,
        );
        builder.onResolve({ filter: /^[^./]/ }, ({ path }) =>
          path === '@stock-app/application' || path === '@stock-app/domain'
            ? undefined
            : { path, external: true },
        );
      },
    },
  ],
});
