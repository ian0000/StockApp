import workspaceConfig from '../../eslint.config.mjs';

export default [
  ...workspaceConfig,
  {
    files: ['src/**/*.ts', 'test/**/*.ts'],
    settings: {
      'import/resolver': {
        typescript: {
          project: './tsconfig.json',
          conditionNames: ['development', 'types', 'node', 'import', 'default'],
        },
      },
    },
  },
];
