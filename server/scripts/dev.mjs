import { spawn } from 'node:child_process';

const env = { ...process.env, NODE_OPTIONS: '--max-old-space-size=4096' };

const nodeProc = spawn('node', ['--max-old-space-size=4096', '--require', 'tsconfig-paths/register', 'dist/index.js'], {
  stdio: 'inherit',
  shell: true,
  env,
});

process.on('SIGINT', () => { try { nodeProc.kill(); } catch {} process.exit(0); });
process.on('SIGTERM', () => { try { nodeProc.kill(); } catch {} process.exit(0); });
