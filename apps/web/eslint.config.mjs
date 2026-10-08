import workspaceConfig from '../../eslint.config.mjs';

export default [
  ...workspaceConfig,
  { ignores: ['src/api/generated/**'] },
  {
    files: ['src/**/*.{ts,tsx}', 'test/**/*.{ts,tsx}'],
    settings: {
      'import/resolver': {
        typescript: {
          project: './tsconfig.json',
          conditionNames: ['development', 'types', 'import', 'default'],
        },
      },
    },
  },
];
