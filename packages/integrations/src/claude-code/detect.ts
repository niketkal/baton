import { spawnSync } from 'node:child_process';
import type { DetectResult } from '../types.js';

/**
 * Detect a local Claude Code install by spawning `claude --version` and
 * parsing the first semver-shaped token from stdout.
 *
 * NEVER throws. Anything goes wrong → `{ installed: false, reason }`.
 * This makes `baton init` safe to call on machines that don't have
 * Claude Code at all.
 *
 * Used by tests via `__setSpawnForTests` so we don't shell out in CI.
 */

type SpawnFn = typeof spawnSync;

let spawnImpl: SpawnFn = spawnSync;

/** Test-only seam. Not exported from the package index. */
export function __setSpawnForTests(fn: SpawnFn | null): void {
  spawnImpl = fn ?? spawnSync;
}

const SEMVER_RE = /\b(\d+\.\d+\.\d+(?:[-+][\w.]+)?)\b/;

export async function detect(): Promise<DetectResult> {
  let result: ReturnType<SpawnFn>;
  try {
    result = spawnImpl('claude', ['--version'], {
      encoding: 'utf8',
      timeout: 5_000,
      windowsHide: true,
    });
  } catch (_err) {
    return { installed: false, reason: 'claude binary not found on PATH' };
  }

  if (result.error) {
    const code = (result.error as NodeJS.ErrnoException).code;
    if (code === 'ENOENT') {
      return { installed: false, reason: 'claude binary not found on PATH' };
    }
    return { installed: false, reason: `claude --version failed: ${result.error.message}` };
  }
  if (typeof result.status === 'number' && result.status !== 0) {
    return { installed: false, reason: `claude --version exited ${result.status}` };
  }

  const out = `${result.stdout ?? ''}${result.stderr ?? ''}`;
  const match = SEMVER_RE.exec(out);
  if (!match) {
    return { installed: false, reason: 'could not parse claude --version output' };
  }
  return { installed: true, version: match[1] as string };
}
