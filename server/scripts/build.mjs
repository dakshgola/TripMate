import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

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
} catch (err) {
  console.error('[build] FATAL: tsc compilation failed.');
  process.exit(1);
}

const distIndex = path.join(__dirname, '../dist/index.js');
const distAppModule = path.join(__dirname, '../dist/nest/app.module.js');
const distSupervisor = path.join(__dirname, '../dist/nest/plugins/supervisor/plugin-supervisor.js');

if (!fs.existsSync(distIndex) || fs.statSync(distIndex).size === 0 ||
    !fs.existsSync(distAppModule) || fs.statSync(distAppModule).size === 0 ||
    !fs.existsSync(distSupervisor) || fs.statSync(distSupervisor).size === 0) {
  console.error('[build] FATAL: Critical files were not emitted or are empty in dist/');
  process.exit(1);
}

// Validate critical named exports
try {
  const ps = require(distSupervisor);
  if (typeof ps.PluginSupervisor !== 'function') {
    console.error('[build] FATAL: PluginSupervisor is not exported as a constructor in dist/nest/plugins/supervisor/plugin-supervisor.js');
    process.exit(1);
  }
} catch (e) {
  console.error('[build] FATAL: Failed to evaluate plugin-supervisor module:', e);
  process.exit(1);
}

// Global scan for any 0-byte files in dist
function checkNoEmptyFiles(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      checkNoEmptyFiles(full);
    } else if (entry.isFile() && full.endsWith('.js') && fs.statSync(full).size === 0) {
      console.error(`[build] FATAL: 0-byte JS file detected in dist: ${full}`);
      process.exit(1);
    }
  }
}
checkNoEmptyFiles(path.join(__dirname, '../dist'));

console.log('[build] dist ready and verified (all critical exports confirmed).');
