import { execSync } from 'node:child_process';

try {
  execSync('npx tsc -p tsconfig.build.json', {
    stdio: 'inherit',
    env: { ...process.env, NODE_OPTIONS: `${process.env.NODE_OPTIONS || ''} --max-old-space-size=4096`.trim() },
  });
} catch {
  console.warn('[build] tsc reported type errors — emitting anyway (gated by `npm run typecheck`).');
}

console.log('[build] dist ready.');
