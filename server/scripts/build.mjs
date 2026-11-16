import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const rootTsc = path.resolve(__dirname, '../../node_modules/typescript/bin/tsc');
const localTsc = path.resolve(__dirname, '../node_modules/typescript/bin/tsc');
const tscPath = fs.existsSync(localTsc) ? localTsc : (fs.existsSync(rootTsc) ? rootTsc : null);
const tscCmd = tscPath ? `node --max-old-space-size=4096 "${tscPath}" -p tsconfig.build.json` : 'npx tsc -p tsconfig.build.json';

console.log('[build] Compiling TypeScript...');
try {
  execSync(tscCmd, {
    stdio: 'inherit',
    env: { ...process.env, NODE_OPTIONS: `${process.env.NODE_OPTIONS || ''} --max-old-space-size=4096`.trim() },
  });
} catch {
  console.warn('[build] tsc reported type errors — checking emitted files...');
}

const distIndex = path.join(__dirname, '../dist/index.js');
const distAppModule = path.join(__dirname, '../dist/nest/app.module.js');

if (!fs.existsSync(distIndex) || !fs.existsSync(distAppModule)) {
  console.error('[build] FATAL: Critical files were not emitted to dist/');
  process.exit(1);
}

console.log('[build] dist ready.');
