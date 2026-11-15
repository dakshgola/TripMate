import { execSync, spawn } from 'node:child_process';
import { existsSync } from 'node:fs';

if (!existsSync('dist/index.js')) {
  console.log('[dev] initial build...');
  execSync('node scripts/build.mjs', { stdio: 'inherit' });
}

const children = [];
const stop = () => { children.forEach((c) => { try { c.kill(); } catch {} }); process.exit(0); };
process.on('SIGINT', stop);
process.on('SIGTERM', stop);

const env = { ...process.env, NODE_OPTIONS: '--max-old-space-size=4096' };

// Start node watching only dist/ so database writes (travel.db) don't trigger restarts
const nodeProc = spawn('node', ['--watch-path=dist', '--require', 'tsconfig-paths/register', 'dist/index.js'], {
  stdio: 'inherit',
  shell: true,
  env,
});
children.push(nodeProc);

// Start tsc -w in background for live recompilation
const tsc = spawn('npx', ['tsc', '-w', '-p', 'tsconfig.build.json', '--preserveWatchOutput'], {
  stdio: 'inherit',
  shell: true,
  env,
});
children.push(tsc);
