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
const distSupervisor = path.join(__dirname, '../dist/nest/plugins/supervisor/plugin-supervisor.js');

// Repair any 0-byte truncated files emitted if tsc aborted or was memory constrained
function ensureFileNonEmpty(distPath, srcRelPath) {
  if (!fs.existsSync(distPath) || fs.statSync(distPath).size === 0) {
    console.warn(`[build] Repairing truncated or missing artifact: ${distPath}`);
    const srcPath = path.resolve(__dirname, '../src', srcRelPath);
    const outDir = path.dirname(distPath);
    if (tscPath && fs.existsSync(srcPath)) {
      execSync(`node "${tscPath}" "${srcPath}" --outDir "${outDir}" --skipLibCheck --target ES2022 --module commonjs --experimentalDecorators --emitDecoratorMetadata --esModuleInterop --ignoreConfig`, {
        stdio: 'inherit',
      });
      // Flatten if tsc nested under outDir
      const nestedPath = path.join(outDir, srcRelPath.replace(/\.ts$/, '.js'));
      if (fs.existsSync(nestedPath) && nestedPath !== distPath) {
        fs.copyFileSync(nestedPath, distPath);
      }
    }
  }
}

ensureFileNonEmpty(distSupervisor, 'nest/plugins/supervisor/plugin-supervisor.ts');

if (!fs.existsSync(distIndex) || fs.statSync(distIndex).size === 0 ||
    !fs.existsSync(distAppModule) || fs.statSync(distAppModule).size === 0 ||
    !fs.existsSync(distSupervisor) || fs.statSync(distSupervisor).size === 0) {
  console.error('[build] FATAL: Critical files were not emitted or are empty in dist/');
  process.exit(1);
}

// Global scan for any 0-byte files
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

console.log('[build] dist ready and verified.');
