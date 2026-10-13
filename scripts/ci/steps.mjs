const packageSteps = (name) =>
  ['lint', 'typecheck', 'test'].map((command) => ({
    name: `${name}:${command}`,
    args: ['--filter', `@stock-app/${name}`, command],
  }));
const generatorSteps = [
  {
    name: 'db:generate',
    args: ['--filter', '@stock-app/api', 'db:generate'],
    clean: ['apps/api/drizzle'],
  },
  {
    name: 'auth:generate',
    args: ['--filter', '@stock-app/api', 'auth:generate'],
    clean: ['apps/api/src/infrastructure/postgres/auth-schema.ts'],
  },
  { name: 'auth:check', args: ['--filter', '@stock-app/api', 'auth:check'] },
];
export const steps = {
  policy: [
    { name: 'ci:test', args: ['ci:test'] },
    { name: 'format:check', args: ['format:check'] },
    { name: 'ci:docs', args: ['ci:docs'] },
    { name: 'ci:workflows', args: ['ci:workflows'] },
    { name: 'ci:lint', args: ['ci:lint'] },
  ],
  web: [
    ...packageSteps('web'),
    {
      name: 'contracts:build',
      args: ['--filter', '@stock-app/contracts', 'build'],
    },
    { name: 'build:web', args: ['build:web'] },
    { name: 'ci:validators', args: ['ci:validators'] },
  ],
  api: [
    ...packageSteps('api'),
    { name: 'build:api', args: ['build:api'] },
    ...generatorSteps,
    { name: 'test:db', args: ['test:db'] },
  ],
  mobile: packageSteps('mobile'),
  contracts: [
    ...packageSteps('contracts'),
    {
      name: 'contracts:build',
      args: ['--filter', '@stock-app/contracts', 'build'],
    },
    { name: 'contracts:openapi:check', args: ['contracts:openapi:check'] },
  ],
  full: [
    { name: 'pnpm check', args: ['check'] },
    { name: 'ci:docs', args: ['ci:docs'] },
    { name: 'ci:workflows', args: ['ci:workflows'] },
    { name: 'ci:validators', args: ['ci:validators'] },
    ...generatorSteps,
    { name: 'test:db', args: ['test:db'] },
  ],
};
