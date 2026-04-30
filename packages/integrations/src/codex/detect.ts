import { spawnSync } from 'node:child_process';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { probeKnownPaths } from '../shared/probe.js';
import type { DetectResult } from '../types.js';

/**
 * Detect a local Codex CLI install.
 *
 * Two-stage strategy:
 *   1. `spawnSync('codex', ['--version'])` — covers PATH installs.
 *      On Windows, tries `codex.exe` first, then `codex`.
 *   2. If PATH lookup returns ENOENT (or status 127), probe a list of
 *      known install locations: macOS desktop app, Homebrew prefixes,
 *      common user-local dirs, plus Windows install dirs (LOCALAPPDATA,
 *      PROGRAMFILES, PROGRAMFILES(X86)). `BATON_CODEX_BIN` overrides the
 *      probe list — when set, only that path is tried.
 *
 * Aliases (e.g. zsh `alias codex=...`) don't propagate to child
 * processes, so PATH-only detection produces false negatives on
 * machines where users ship the desktop app + an alias. The probe
 * fallback is what makes those installs visible.
 *
 * NEVER throws; absence -> `installed: false`.
 */

type SpawnFn = typeof spawnSync;

let spawnImpl: SpawnFn = spawnSync;

/** Test-only seam. Not exported from the package index. */
export function __setSpawnForTests(fn: SpawnFn | null): void {
  spawnImpl = fn ?? spawnSync;
}

const SEMVER_RE = /\b(\d+\.\d+\.\d+(?:[-+][\w.]+)?)\b/;

function knownCandidates(): string[] {
  const home = homedir();
  const posix = [
    '/Applications/Codex.app/Contents/Resources/codex',
    '/usr/local/bin/codex',
    '/opt/homebrew/bin/codex',
    join(home, '.codex', 'bin', 'codex'),
    join(home, '.local', 'bin', 'codex'),
  ];
  // Windows-specific install locations. On POSIX systems these env vars
  // are unset and `existsSync` will filter them out, so the list is safe
  // to walk on every platform — but we only emit them when on win32 to
  // avoid `<undefined>\Programs\Codex\codex.exe` strings in the candidate
  // list.
  if (process.platform !== 'win32') return posix;
  const localAppData = process.env.LOCALAPPDATA;
  const programFiles = process.env.PROGRAMFILES;
  const programFilesX86 = process.env['PROGRAMFILES(X86)'];
  const win: string[] = [];
  if (localAppData) win.push(join(localAppData, 'Programs', 'Codex', 'codex.exe'));
  if (programFiles) win.push(join(programFiles, 'Codex', 'codex.exe'));
  if (programFilesX86) win.push(join(programFilesX86, 'Codex', 'codex.exe'));
  return [...posix, ...win];
}

/** Bare names to try via PATH. Windows tries `codex.exe` first then `codex`. */
function pathNames(): string[] {
  return process.platform === 'win32' ? ['codex.exe', 'codex'] : ['codex'];
}

async function tryPathLookup(): Promise<
  | { kind: 'hit'; path: string; version?: string }
  | { kind: 'miss' }
  | { kind: 'err'; reason: string }
> {
  for (const name of pathNames()) {
    let result: ReturnType<SpawnFn> | undefined;
    let spawnThrew = false;
    try {
      result = spawnImpl(name, ['--version'], {
        encoding: 'utf8',
        timeout: 5_000,
        windowsHide: true,
      });
    } catch {
      spawnThrew = true;
    }
    if (spawnThrew || !result) continue;
    if (result.error) {
      const code = (result.error as NodeJS.ErrnoException).code;
      if (code === 'ENOENT') continue;
      return { kind: 'err', reason: `codex --version failed: ${result.error.message}` };
    }
    if (typeof result.status === 'number' && result.status !== 0) {
      if (result.status === 127) continue;
      return { kind: 'err', reason: `codex --version exited ${result.status}` };
    }
    const out = `${result.stdout ?? ''}${result.stderr ?? ''}`;
    const match = SEMVER_RE.exec(out);
    return match
      ? { kind: 'hit', path: name, version: match[1] as string }
      : { kind: 'hit', path: name };
  }
  return { kind: 'miss' };
}

export async function detect(): Promise<DetectResult> {
  const lookup = await tryPathLookup();
  if (lookup.kind === 'err') {
    return { installed: false, reason: lookup.reason };
  }
  if (lookup.kind === 'hit') {
    return lookup.version
      ? { installed: true, version: lookup.version, path: lookup.path }
      : { installed: true, path: lookup.path };
  }

  // PATH lookup missed. Probe known install paths.
  const envOverride = process.env.BATON_CODEX_BIN;
  if (envOverride && envOverride.length > 0) {
    const hit = probeKnownPaths([envOverride], spawnImpl);
    if (hit) {
      return hit.version
        ? { installed: true, version: hit.version, path: hit.path }
        : { installed: true, path: hit.path };
    }
    return {
      installed: false,
      reason: `BATON_CODEX_BIN set to ${envOverride} but that path did not respond to --version`,
    };
  }

  const hit = probeKnownPaths(knownCandidates(), spawnImpl);
  if (hit) {
    return hit.version
      ? { installed: true, version: hit.version, path: hit.path }
      : { installed: true, path: hit.path };
  }

  return { installed: false, reason: 'codex binary not found on PATH' };
}
