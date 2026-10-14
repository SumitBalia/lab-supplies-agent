import { spawn } from 'node:child_process';
import { join } from 'node:path';
import 'dotenv/config';
const production = process.argv.includes('--production');
const children = [
  ['node_modules/tsx/dist/cli.mjs', 'server/mock.ts'],
  ['node_modules/tsx/dist/cli.mjs', 'server/index.ts'],
  [
    'node_modules/next/dist/bin/next',
    production ? 'start' : 'dev',
    '--hostname',
    process.env.BIND_HOST ?? '127.0.0.1',
    '--port',
    '3000',
    ...(production ? [] : ['--webpack']),
  ],
].map((args) =>
  spawn(
    process.execPath,
    args.map((arg, i) => (i === 0 ? join(process.cwd(), arg) : arg)),
    { stdio: 'inherit', env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' } },
  ),
);
let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) child.kill('SIGTERM');
  setTimeout(() => process.exit(code), 1000).unref();
}
for (const child of children)
  child.on('exit', (code) => {
    if (!stopping) stop(code ?? 1);
  });
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, () => stop());
