import path from 'node:path';

// [BOOT] Structured stage logging and process diagnostics
console.log(`[BOOT] Node process launched (PID: ${process.pid}, UID: ${process.getuid?.() ?? 'n/a'}, CWD: ${process.cwd()})`);

// Global uncaught exception and unhandled rejection handlers to prevent silent exit
process.on('uncaughtException', (err: Error) => {
  process.stderr.write(`[FATAL] Uncaught Exception at top level:\n${err.stack || err.message || err}\n`);
  process.exit(1);
});

process.on('unhandledRejection', (reason: unknown) => {
  process.stderr.write(`[FATAL] Unhandled Promise Rejection:\n${reason instanceof Error ? reason.stack : String(reason)}\n`);
  process.exit(1);
});

// Guarantee MCP SDK path mappings are ALWAYS registered with absolute baseUrl
// regardless of process.cwd() or whether --require tsconfig-paths/register was passed on the command line.
try {
  const tsConfigPaths = require('tsconfig-paths');
  // In source ts: __dirname is src/, so '..' is server/
  // In dist js:   __dirname is dist/, so '..' is server/
  const serverDir = path.resolve(__dirname, '..');
  const result = tsConfigPaths.loadConfig(serverDir);
  if (result.resultType === 'success') {
    tsConfigPaths.register({
      baseUrl: path.resolve(serverDir, result.baseUrl || '.'),
      paths: result.paths,
    });
    console.log(`[BOOT] Path mappings registered (baseUrl: ${path.resolve(serverDir, result.baseUrl || '.')})`);
  } else {
    // Fallback: search relative to process.cwd() or /app/server
    const fallbackDir = path.resolve(process.cwd(), 'server');
    const fallbackResult = tsConfigPaths.loadConfig(fallbackDir);
    if (fallbackResult.resultType === 'success') {
      tsConfigPaths.register({
        baseUrl: path.resolve(fallbackDir, fallbackResult.baseUrl || '.'),
        paths: fallbackResult.paths,
      });
      console.log(`[BOOT] Path mappings registered via fallback (baseUrl: ${path.resolve(fallbackDir, fallbackResult.baseUrl || '.')})`);
    }
  }
} catch (e: unknown) {
  console.warn('[BOOT] tsconfig-paths programmatic registration warning:', e instanceof Error ? e.message : e);
}

console.log('[BOOT] index.ts loaded & preboot diagnostics initialized');
console.log('[BOOT] preboot loaded');
