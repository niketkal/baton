/**
 * Codex wrapper-launcher runtime.
 *
 * Two operating modes:
 *
 * 1. **TTY pass-through (interactive sessions):** when *both* stdin
 *    and stdout are real terminals, spawn codex with
 *    `stdio: 'inherit'` so it sees a TTY and enters interactive mode.
 *    Codex hard-fails with "stdin is not a terminal" or "stdout is not
 *    a terminal" if either side is piped, so we don't enter this mode
 *    unless both are TTYs. We can't scan stdout live in this mode
 *    (codex owns the terminal), so the limit-marker handoff is
 *    *post-hoc*: on exit, find the most recently modified rollout under
 *    `~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl` that was created
 *    during this run, scan it for limit markers, and trigger the handoff
 *    against that file. The rollout has full turn-by-turn fidelity (see
 *    issue #43 for the parser), so quality matches live capture.
 *
 * 2. **Pipe mode (CI / non-interactive):** when stdout is NOT a TTY
 *    (e.g. piped to a file or running in CI), spawn codex with stdout
 *    piped so the wrapper can scan output live, forward chunks to the
 *    parent's stdout, and fire the handoff trigger on the first marker
 *    hit. Codex tolerates a non-TTY stdout in non-interactive use.
 *
 * Marker detection fires at most once per wrapper session in either
 * mode (so a marker echoing repeatedly in the rollout doesn't spam the
 * clipboard).
 *
 * Test seams:
 *   - `runWrapperOnStream(stream, opts)` exercises pipe-mode logic
 *     against any `Readable` plus a fake `trigger`.
 *   - `findLatestRolloutSince(sinceMs, sessionsDir)` is exported so the
 *     post-hoc handoff path can be tested without a live codex spawn.
 */

import { spawn } from 'node:child_process';
import {
  createWriteStream,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
} from 'node:fs';
import { homedir, tmpdir } from 'node:os';
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
  /**
   * Override the codex sessions root for post-hoc rollout discovery.
   * Defaults to `~/.codex/sessions`. Tests inject a fixture directory
   * here.
   */
  sessionsDir?: string;
  /**
   * Override the spawn mode. Default: auto (TTY → 'tty', non-TTY →
   * 'pipe'). Tests use 'tty' to exercise the post-hoc rollout path
   * without a real terminal, and 'pipe' to run pipe-mode logic in CI.
   */
  mode?: 'tty' | 'pipe';
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
  await runBaton(['compile', '--mode', 'fast', '--packet', 'current-task']);
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
 * Walk the codex sessions tree and return the path of the
 * `rollout-*.jsonl` whose mtime is greatest *and* >= `sinceMs`. Used
 * by TTY pass-through mode to find the rollout codex wrote during this
 * wrapper invocation. Returns `null` if no such file exists.
 *
 * The sessions tree is `<sessionsDir>/YYYY/MM/DD/rollout-*.jsonl`. We
 * walk only directories that match `\d+`-shape names so a stray
 * non-numeric folder doesn't blow up the scan.
 */
export function findLatestRolloutSince(
  sinceMs: number,
  sessionsDir: string = join(homedir(), '.codex', 'sessions'),
): string | null {
  if (!existsSync(sessionsDir)) return null;
  let best: { path: string; mtime: number } | null = null;

  const isNumericDir = (name: string): boolean => /^\d+$/.test(name);

  const safeReaddir = (dir: string): string[] => {
    try {
      return readdirSync(dir);
    } catch {
      return [];
    }
  };

  for (const year of safeReaddir(sessionsDir)) {
    if (!isNumericDir(year)) continue;
    const yDir = join(sessionsDir, year);
    for (const month of safeReaddir(yDir)) {
      if (!isNumericDir(month)) continue;
      const mDir = join(yDir, month);
      for (const day of safeReaddir(mDir)) {
        if (!isNumericDir(day)) continue;
        const dDir = join(mDir, day);
        for (const file of safeReaddir(dDir)) {
          if (!file.startsWith('rollout-') || !file.endsWith('.jsonl')) continue;
          const full = join(dDir, file);
          let mtime: number;
          try {
            mtime = statSync(full).mtimeMs;
          } catch {
            continue;
          }
          if (mtime < sinceMs) continue;
          if (best === null || mtime > best.mtime) {
            best = { path: full, mtime };
          }
        }
      }
    }
  }
  return best?.path ?? null;
}

/**
 * Default post-hoc handoff: ingest the rollout as a transcript artifact,
 * fast-compile, and render for claude-code with clipboard copy. Codex's
 * rollout JSONL is parsed structurally (see `@batonai/compiler` codex
 * parser), so the resulting packet has real objective/current_state.
 */
async function defaultPostHocHandoff(rolloutPath: string): Promise<void> {
  await runBaton(['ingest', 'transcript', rolloutPath, '--packet', 'current-task']);
  await runBaton(['compile', '--mode', 'fast', '--packet', 'current-task']);
  await runBaton(['render', '--packet', 'current-task', '--target', 'claude-code', '--copy']);
}

/**
 * Top-level entry: spawn `codex <args>` and either forward stdio (TTY
 * mode) or pipe stdout for live marker scanning (non-TTY mode).
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

  // Codex requires both stdin AND stdout to be TTYs to enter
  // interactive mode. If either is non-TTY (e.g. running under a
  // harness that pipes stdin), fall back to pipe mode so the user
  // sees the existing live-scanning behaviour rather than codex's
  // bare "stdin/stdout is not a terminal" error.
  const inheritsRealTty = process.stdin.isTTY === true && process.stdout.isTTY === true;
  const resolvedMode: 'tty' | 'pipe' = opts.mode ?? (inheritsRealTty ? 'tty' : 'pipe');
  const usePipeMode = resolvedMode === 'pipe';
  const notify =
    opts.notify ??
    ((line) => {
      process.stderr.write(`${line}\n`);
    });

  if (!usePipeMode) {
    // TTY pass-through: codex needs a real terminal for interactive
    // mode. We give up live stdout scanning and reach for the rollout
    // file codex wrote during this invocation after it exits.
    const startedAtMs = Date.now();
    // On Windows, codex may be installed as a `.cmd`/`.bat` shim; shell
    // resolution via PATHEXT requires shell:true, same as pipe mode.
    const child = spawn(bin, [...argv], {
      stdio: 'inherit',
      windowsHide: true,
      shell: process.platform === 'win32',
    });

    const exitCode: number = await new Promise((resolve) => {
      child.on('error', () => resolve(127));
      child.on('exit', (code) => resolve(code ?? 0));
    });

    // Find the rollout codex wrote during this run, scan it for a
    // limit marker, and fire the handoff if we hit one. The session
    // dir on disk is the source of truth — the rollout is appended to
    // as the session runs and is closed by codex on exit, so the file
    // is complete by the time we look at it.
    const rolloutPath = findLatestRolloutSince(startedAtMs, opts.sessionsDir);
    if (rolloutPath !== null) {
      let content = '';
      try {
        content = readFileSync(rolloutPath, 'utf8');
      } catch {
        // unreadable rollout — skip handoff, exit normally
      }
      if (content.length > 0 && hasLimitMarker(content)) {
        notify(
          '[baton] limit detected in codex session — handoff prepared for claude-code (clipboard).',
        );
        const handoff = opts.onLimit ?? defaultPostHocHandoff;
        try {
          await handoff(rolloutPath);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          notify(`[baton] handoff trigger failed: ${msg}`);
        }
      }
    }

    return exitCode;
  }

  // Non-TTY pipe mode (CI etc.) — preserve the original live-scanning
  // behaviour. Stdin is inherited so a piped CI script can still feed
  // codex; stdout is piped so we can scan it before forwarding.
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
      watcher.then(() => resolve(code ?? 0)).catch(() => resolve(code ?? 0));
    });
  });
}
