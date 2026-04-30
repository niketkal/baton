/**
 * Codex wrapper-launcher runtime.
 *
 * Spawns `codex` as a subprocess with stdin/stderr inherited and stdout
 * piped so we can scan it for limit markers (`./markers.ts`). On a
 * marker hit we:
 *
 *   1. Forward the chunk to the user's terminal (never swallow output).
 *   2. Asynchronously trigger `baton compile --fast && baton render
 *      --target claude-code --copy`. The trigger is fire-and-forget;
 *      the codex subprocess keeps running.
 *   3. Print a single notification line to stderr so the user knows the
 *      handoff was prepared.
 *
 * Marker detection fires at most once per wrapper session (subsequent
 * matches are suppressed) so we don't spam clipboard writes if the
 * limit message repeats in the transcript.
 *
 * Test seam: `runWrapperOnStream(stream, opts)` accepts any Readable
 * (and a `trigger` callback) so tests can pipe a fake stdout without
 * spawning a real codex binary.
 */

import { spawn } from 'node:child_process';
import type { Readable } from 'node:stream';
import { detect } from './detect.js';
import { hasLimitMarker } from './markers.js';

export interface WrapperOptions {
  /**
   * Called exactly once when the first limit marker is detected. If
   * omitted, the default trigger spawns `baton compile --fast` followed
   * by `baton render --target claude-code --copy`.
   */
  onLimit?: () => Promise<void> | void;
  /**
   * Where to forward codex stdout chunks. Defaults to `process.stdout.write`.
   * Tests inject a buffer collector here.
   */
  forward?: (chunk: Buffer) => void;
  /**
   * Where to print the [baton] notification line. Defaults to stderr.
   */
  notify?: (line: string) => void;
  /**
   * Path to the `codex` binary to spawn. When omitted, the wrapper calls
   * `detect()` and uses the resolved path so off-PATH installs (macOS
   * desktop app) work without further configuration.
   */
  codexBin?: string;
}

/**
 * Wire a Readable through marker detection. Resolves when the stream
 * ends. Never rejects on stream errors — the caller (codex subprocess)
 * decides what to do with the spawn-level error.
 */
export function runWrapperOnStream(
  stream: Readable,
  opts: WrapperOptions = {},
): Promise<{ triggered: boolean }> {
  const forward = opts.forward ?? ((c) => process.stdout.write(c));
  const notify =
    opts.notify ??
    ((line) => {
      process.stderr.write(`${line}\n`);
    });
  const onLimit = opts.onLimit ?? defaultHandoff;

  let triggered = false;
  // We scan a sliding window so a marker that straddles a chunk boundary
  // still matches. 4 KiB is wide enough for any single error line and
  // keeps memory bounded for noisy streams.
  const WINDOW_BYTES = 4096;
  let window = '';

  return new Promise((resolve) => {
    stream.on('data', (chunk: Buffer) => {
      forward(chunk);
      if (triggered) return;
      window = (window + chunk.toString('utf8')).slice(-WINDOW_BYTES);
      if (hasLimitMarker(window)) {
        triggered = true;
        notify('[baton] limit detected — handoff prepared for claude-code (clipboard).');
        // Fire-and-forget. We don't block stdout forwarding on the trigger.
        Promise.resolve()
          .then(() => onLimit())
          .catch((err: unknown) => {
            const msg = err instanceof Error ? err.message : String(err);
            notify(`[baton] handoff trigger failed: ${msg}`);
          });
      }
    });
    stream.on('end', () => resolve({ triggered }));
    stream.on('close', () => resolve({ triggered }));
    stream.on('error', () => resolve({ triggered }));
  });
}

/**
 * Default handoff: spawn `baton compile --fast` then
 * `baton render --target claude-code --copy`. Returns when both
 * subprocesses have exited.
 */
async function defaultHandoff(): Promise<void> {
  await runBaton(['compile', '--fast']);
  await runBaton(['render', '--target', 'claude-code', '--copy']);
}

function runBaton(args: readonly string[]): Promise<void> {
  return new Promise((resolve) => {
    const proc = spawn('baton', args, {
      stdio: ['ignore', 'ignore', 'pipe'],
      windowsHide: true,
    });
    proc.on('error', () => resolve());
    proc.on('exit', () => resolve());
  });
}

/**
 * Top-level entry: spawn `codex <args>`, forward stdio, scan stdout.
 * Resolves with the codex exit code so the wrapper script can exit
 * with the same code (preserving normal codex semantics).
 */
export async function runWrapper(
  argv: readonly string[],
  opts: WrapperOptions = {},
): Promise<number> {
  let bin = opts.codexBin;
  if (!bin) {
    try {
      const result = await detect();
      // Fall back to the platform-appropriate bare name when detect
      // can't resolve a path (e.g. user installed codex after init).
      bin = result.path ?? (process.platform === 'win32' ? 'codex.exe' : 'codex');
    } catch {
      bin = process.platform === 'win32' ? 'codex.exe' : 'codex';
    }
  }
  const child = spawn(bin, [...argv], {
    stdio: ['inherit', 'pipe', 'inherit'],
    windowsHide: true,
  });

  // child.stdout is non-null because we explicitly piped it.
  const stdout = child.stdout as Readable;
  const watcher = runWrapperOnStream(stdout, opts);

  return new Promise((resolve) => {
    child.on('error', () => resolve(127));
    child.on('exit', (code) => {
      // Wait for the watcher to drain so we don't return before the last
      // chunk is forwarded. The watcher always resolves on stream close.
      watcher.then(() => resolve(code ?? 0)).catch(() => resolve(code ?? 0));
    });
  });
}
