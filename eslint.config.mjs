import expoConfig from 'eslint-config-expo/flat.js';

export default [
  ...expoConfig,
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
