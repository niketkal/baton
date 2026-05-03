/**
 * Codex wrapper-launcher runtime.
 *
 * Spawns `codex` as a subprocess with stdin/stderr inherited and stdout
 * piped so we can scan it for limit markers (`./markers.ts`). On a
 * marker hit we:
 *
 *   1. Forward the chunk to the user's terminal (never swallow output).
 *   2. Asynchronously trigger `baton ingest transcript <tmpfile> &&
 *      baton compile --fast --packet current-task && baton render
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
import { createWriteStream, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Readable } from 'node:stream';
import { detect } from './detect.js';
import { hasLimitMarker } from './markers.js';

export interface WrapperOptions {
  /**
   * Called exactly once when the first limit marker is detected. Receives
   * the path to a tmp file containing the buffered codex stdout so the
   * trigger can ingest it as a transcript artifact. If omitted, the
   * default trigger ingests the file then runs compile + render.
   */
  onLimit?: (transcriptPath: string) => Promise<void> | void;
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
  /**
   * Where to write the buffered stdout that gets ingested on a limit
   * marker. Defaults to `<tmpdir>/baton-codex-<random>.txt`. Tests
   * inject a deterministic path here.
   */
  transcriptPath?: string;
}

/**
 * Generate the default transcript buffer path. Random suffix prevents
 * collisions if multiple wrappers run concurrently.
 */
function defaultTranscriptPath(): string {
  const dir = join(tmpdir(), 'baton-codex');
  mkdirSync(dir, { recursive: true });
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  return join(dir, `session-${suffix}.txt`);
}

/**
 * Wire a Readable through marker detection. Resolves when the stream
 * ends. Never rejects on stream errors — the caller (codex subprocess)
 * decides what to do with the spawn-level error.
 */
export function runWrapperOnStream(
  stream: Readable,
  opts: WrapperOptions = {},
): Promise<{ triggered: boolean; transcriptPath: string }> {
  const forward = opts.forward ?? ((c) => process.stdout.write(c));
  const notify =
    opts.notify ??
    ((line) => {
      process.stderr.write(`${line}\n`);
    });
  const transcriptPath = opts.transcriptPath ?? defaultTranscriptPath();
  const onLimit = opts.onLimit ?? defaultHandoff;

  // Buffer every chunk to a temp file so the limit-marker handler can
  // hand it to `baton ingest transcript` without re-allocating a giant
  // in-memory string. Ingest reads from this path; the file persists
  // after the wrapper exits because ingest hashes + copies it into
  // `.baton/artifacts/<uuid>/` synchronously, which is what we want.
  const transcriptStream = createWriteStream(transcriptPath, { flags: 'w' });

  let triggered = false;
  // We scan a sliding window so a marker that straddles a chunk boundary
  // still matches. 4 KiB is wide enough for any single error line and
  // keeps memory bounded for noisy streams.
  const WINDOW_BYTES = 4096;
  let window = '';

  return new Promise((resolve) => {
    stream.on('data', (chunk: Buffer) => {
      forward(chunk);
      transcriptStream.write(chunk);
      if (triggered) return;
      window = (window + chunk.toString('utf8')).slice(-WINDOW_BYTES);
      if (hasLimitMarker(window)) {
        triggered = true;
        notify('[baton] limit detected — handoff prepared for claude-code (clipboard).');
        // Fire-and-forget. We don't block stdout forwarding on the trigger.
        Promise.resolve()
          .then(() => onLimit(transcriptPath))
          .catch((err: unknown) => {
            const msg = err instanceof Error ? err.message : String(err);
            notify(`[baton] handoff trigger failed: ${msg}`);
          });
      }
    });
    const finish = (): void => {
      transcriptStream.end(() => resolve({ triggered, transcriptPath }));
    };
    stream.on('end', finish);
    stream.on('close', finish);
    stream.on('error', finish);
  });
}

/**
 * Default handoff: ingest the buffered codex stdout as a transcript
 * artifact, run a fast compile, then render for claude-code with
 * clipboard copy. Returns when all subprocesses have exited.
 */
async function defaultHandoff(transcriptPath: string): Promise<void> {
  await runBaton(['ingest', 'transcript', transcriptPath, '--packet', 'current-task']);
  await runBaton(['compile', '--fast', '--packet', 'current-task']);
  await runBaton(['render', '--packet', 'current-task', '--target', 'claude-code', '--copy']);
}

function runBaton(args: readonly string[]): Promise<void> {
  return new Promise((resolve) => {
    const proc = spawn('baton', args, {
      stdio: ['ignore', 'ignore', 'pipe'],
      windowsHide: true,
      // npm-installed `baton` is a `.cmd` shim on Windows; spawn refuses
      // to execute those directly. shell:true routes through cmd.exe so
      // PATHEXT resolves the shim.
      shell: process.platform === 'win32',
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
      bin = result.path ?? 'codex';
    } catch {
      bin = 'codex';
    }
  }
  // On Windows, codex may be installed as a `.cmd`/`.bat` shim (e.g. npm
  // install -g). Node refuses to spawn those directly. Going through
  // cmd.exe (via shell:true) lets the shell resolve the binary using
  // PATHEXT and execute the resulting batch file. The user-provided argv
  // is forwarded unchanged; cmd.exe parsing of those args is the same
  // path codex itself would use if launched from a Windows terminal.
  const child = spawn(bin, [...argv], {
    stdio: ['inherit', 'pipe', 'inherit'],
    windowsHide: true,
    shell: process.platform === 'win32',
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
