import path from 'node:path';
import fs from 'node:fs';

// [BOOT] Structured stage logging and process diagnostics
console.log(`[BOOT] Node process launched (PID: ${process.pid}, UID: ${process.getuid?.() ?? 'n/a'}, CWD: ${process.cwd()})`);

// Synchronous fatal logger using fs.writeSync to fd 1 (stdout) and fd 2 (stderr)
// Guarantees fatal stack traces reach OS kernel buffers before process termination
function fatalLog(prefix: string, err: any): void {
  const stack = err?.stack || err?.message || String(err);
  const msg = `\n========================================\n${prefix}\n${stack}\n========================================\n\n`;
  try { fs.writeSync(2, msg); } catch {}
  try { fs.writeSync(1, msg); } catch {}
}

process.on('uncaughtException', (err: any) => {
  fatalLog('[FATAL] Uncaught Exception at top level:', err);
  process.exit(1);
});

process.on('unhandledRejection', (reason: any) => {
  fatalLog('[FATAL] Unhandled Promise Rejection:', reason);
  process.exit(1);
});

console.log('[BOOT] index.ts loaded & preboot diagnostics initialized');
console.log('[BOOT] preboot loaded');
