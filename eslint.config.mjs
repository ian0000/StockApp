import expoConfig from 'eslint-config-expo/flat.js';

export default [
  ...expoConfig,
  {
    files: ['scripts/ci/**/*.mjs'],
    languageOptions: {
      globals: {
        process: 'readonly',
        console: 'readonly',
        Buffer: 'readonly',
        fetch: 'readonly',
      },
    },
  },
  {
    ignores: [
      '**/.expo/**',
      '**/build/**',
      '**/coverage/**',
      '**/dist/**',
      '**/node_modules/**',
      '**/web-build/**',
    ],
  },
];
