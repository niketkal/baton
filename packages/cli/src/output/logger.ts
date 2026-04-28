import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { type Logger, pino } from 'pino';

/**
 * Cached singletons keyed by the resolved log directory so multiple
 * commands in the same process (notably tests calling `main()`
 * repeatedly) share one file handle.
 */
const cache = new Map<string, Logger>();
// Track the underlying SonicBoom destinations so tests can close the file
// handles before deleting the temp directory. On Windows an open handle
// blocks `rmdir` of the parent (`ENOTEMPTY`); on POSIX it's silently fine.
const destinations = new Map<string, ReturnType<typeof pino.destination>>();
let bannerPrinted = false;

function resolveLogLevel(): string {
  const raw = (process.env.BATON_LOG_LEVEL ?? 'info').toLowerCase();
  if (raw === 'debug-unsafe') return 'debug';
  if (['trace', 'debug', 'info', 'warn', 'error', 'fatal', 'silent'].includes(raw)) {
    return raw;
  }
  return 'info';
}

function todayStamp(): string {
  const d = new Date();
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export interface LoggerHandle {
  logger: Logger;
  unsafe: boolean;
  filePath: string;
}

/**
 * Open (or reuse) a pino logger writing to `<repoRoot>/.baton/logs/<date>.log`.
 *
 * In `BATON_LOG_LEVEL=debug-unsafe` mode the logger:
 *  - Prints a one-time banner to stderr naming the log file path
 *  - Tags every line with `{ unsafe: true }`
 *  - Uses a 24h rotation policy (rotation handler lives outside; this
 *    layer only signals via the file name suffix)
 */
export function getLogger(repoRoot: string): LoggerHandle {
  const unsafe = (process.env.BATON_LOG_LEVEL ?? '').toLowerCase() === 'debug-unsafe';
  const logDir = join(repoRoot, '.baton', 'logs');
  const suffix = unsafe ? '-unsafe' : '';
  const filePath = join(logDir, `${todayStamp()}${suffix}.log`);
  const cached = cache.get(filePath);
  if (cached) return { logger: cached, unsafe, filePath };

  mkdirSync(logDir, { recursive: true });

  if (unsafe && !bannerPrinted) {
    bannerPrinted = true;
    process.stderr.write(
      `[baton] BATON_LOG_LEVEL=debug-unsafe — raw artifact content may be written to ${filePath}.\n`,
    );
  }

  const base: Record<string, unknown> = unsafe ? { unsafe: true } : {};
  // Use sync file destination to avoid worker threads (faster cold start,
  // simpler cleanup in tests).
  const destination = pino.destination({ dest: filePath, sync: true, mkdir: true });
  const logger = pino(
    {
      level: resolveLogLevel(),
      base,
      timestamp: pino.stdTimeFunctions.isoTime,
    },
    destination,
  );
  cache.set(filePath, logger);
  destinations.set(filePath, destination);
  return { logger, unsafe, filePath };
}

/**
 * Flush and close all open log file handles. Tests must `await` this
 * before deleting the temp `.baton/logs` directory on Windows, where
 * an open handle blocks `rmdir` of the parent (`ENOTEMPTY`).
 *
 * Safe to call when no logger is open (no-op).
 */
export async function closeLogger(): Promise<void> {
  const dests = Array.from(destinations.values());
  cache.clear();
  destinations.clear();
  bannerPrinted = false;
  await Promise.all(
    dests.map(
      (dest) =>
        new Promise<void>((resolve) => {
          try {
            dest.flushSync();
          } catch {
            // best-effort
          }
          // SonicBoom is an EventEmitter; emit `'close'` when fd is released.
          let settled = false;
          const done = (): void => {
            if (settled) return;
            settled = true;
            resolve();
          };
          try {
            dest.once('close', done);
            dest.once('error', done);
            dest.end();
            // Belt-and-suspenders: don't hang teardown if `'close'` never fires.
            setTimeout(done, 200);
          } catch {
            done();
          }
        }),
    ),
  );
}

/**
 * Reset the cached loggers. Tests use this between cases so a stale
 * handle to a deleted temp directory doesn't leak across runs.
 */
export function resetLoggerCacheForTests(): void {
  for (const l of cache.values()) {
    try {
      l.flush?.();
    } catch {
      // best-effort; tests tear down the directory anyway
    }
  }
  cache.clear();
  // Note: leaves `destinations` populated so a subsequent `closeLogger()`
  // can still end the underlying SonicBoom streams. `closeLogger()` is
  // the preferred teardown API; this sync reset remains for compatibility.
  bannerPrinted = false;
}
