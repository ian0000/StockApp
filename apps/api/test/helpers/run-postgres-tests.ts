import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { createProvisioningGate } from './provisioning-gate.js';

const gate = await createProvisioningGate();
try {
  const child = spawn(
    process.execPath,
    [
      createRequire(import.meta.url).resolve('tsx/cli'),
      '--conditions=development',
      '--test',
      ...process.argv.slice(2),
    ],
    {
      stdio: 'inherit',
      windowsHide: true,
      env: {
        ...process.env,
        TEST_PROVISIONING_URL: gate.url,
        TEST_PROVISIONING_TOKEN: gate.token,
      },
    },
  );
  process.exitCode = await new Promise<number>((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', (code) => resolve(code ?? 1));
  });
} finally {
  await gate.close();
}
