/**
 * Patch Claude Code's user-level settings.json to register Baton's
 * hook scripts. This is the only supported way for a third-party CLI
 * to install hooks that actually fire — `~/.claude/plugins/<name>/`
 * files are dormant unless the plugin is enabled via a marketplace.
 *
 * Schema (per Claude Code docs):
 *   {
 *     "hooks": {
 *       "PreCompact": [
 *         {
 *           "matcher": "*",
 *           "hooks": [{ "type": "command", "command": "/abs/path/to/script.sh" }]
 *         }
 *       ],
 *       ...
 *     },
 *     ...other user-controlled keys preserved verbatim
 *   }
 *
 * Etiquette:
 *   - Never touch keys we don't own (enabledPlugins, effortLevel, etc.)
 *   - Identify our own entries by the absolute command path containing
 *     the baton scripts dir, so uninstall can remove them precisely
 *   - Atomic write via temp + rename to avoid partial-file corruption
 *     if the process is killed mid-write
 */

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

interface CommandHook {
  type?: string;
  command?: string;
  timeout?: number;
  async?: boolean;
}

interface HookEntry {
  matcher?: string;
  hooks?: CommandHook[];
}

interface SettingsShape {
  hooks?: Record<string, HookEntry[]>;
  [key: string]: unknown;
}

export interface HookRegistration {
  /** Claude Code event name (PreCompact, Stop, SessionEnd, ...). */
  event: string;
  /** Absolute path to the script that should run. */
  command: string;
}

export function defaultSettingsPath(): string {
  const home = process.env.HOME ?? process.env.USERPROFILE ?? homedir();
  return join(home, '.claude', 'settings.json');
}

function readSettings(path: string): SettingsShape {
  if (!existsSync(path)) return {};
  try {
    const raw = readFileSync(path, 'utf8');
    if (raw.trim().length === 0) return {};
    return JSON.parse(raw) as SettingsShape;
  } catch {
    // Malformed JSON shouldn't lose user data; bail without writing.
    throw new Error(`settings.json at ${path} is not valid JSON; refusing to patch`);
  }
}

function writeSettings(path: string, data: SettingsShape): void {
  mkdirSync(dirname(path), { recursive: true });
  const serialized = `${JSON.stringify(data, null, 2)}\n`;
  // Atomic: write to .tmp then rename so a partial write doesn't
  // leave the user with a broken settings.json on a crash.
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, serialized, 'utf8');
  renameSync(tmp, path);
}

/**
 * Identify a hook entry as Baton-managed if any of its commands point
 * at a path under `scriptsDir`. We compare absolute paths exactly so
 * an unrelated tool whose script happens to live nearby won't be
 * mistaken for ours.
 */
function isOurEntry(entry: HookEntry, scriptsDir: string): boolean {
  if (!entry.hooks) return false;
  return entry.hooks.some((h) => typeof h.command === 'string' && h.command.startsWith(scriptsDir));
}

/**
 * Merge Baton hook registrations into a user-level settings.json.
 * Idempotent: re-running with the same registrations does not create
 * duplicates. Non-baton entries are preserved untouched.
 *
 * `scriptsDir` is the absolute prefix that identifies baton-owned hook
 * commands (e.g., `~/.claude/plugins/baton/hooks/`). Any existing
 * baton-owned entry for an event is replaced; entries belonging to
 * other tools are kept as-is.
 */
export function applyHookRegistrations(
  settingsPath: string,
  scriptsDir: string,
  registrations: readonly HookRegistration[],
): void {
  const settings = readSettings(settingsPath);
  const hooks: Record<string, HookEntry[]> = settings.hooks ?? {};

  // Group desired registrations by event.
  const byEvent = new Map<string, HookRegistration[]>();
  for (const reg of registrations) {
    const arr = byEvent.get(reg.event) ?? [];
    arr.push(reg);
    byEvent.set(reg.event, arr);
  }

  for (const [event, regs] of byEvent.entries()) {
    const existing = hooks[event] ?? [];
    const kept = existing.filter((e) => !isOurEntry(e, scriptsDir));
    const ours: HookEntry = {
      matcher: '*',
      hooks: regs.map((r) => ({ type: 'command', command: r.command })),
    };
    hooks[event] = [...kept, ours];
  }

  settings.hooks = hooks;
  writeSettings(settingsPath, settings);
}

/**
 * Remove all Baton hook entries (those whose commands live under
 * `scriptsDir`) from a settings.json. Empty event arrays are dropped
 * so we don't leave bookkeeping cruft behind. The `hooks` key itself
 * is removed only if no events remain.
 */
export function removeHookRegistrations(settingsPath: string, scriptsDir: string): void {
  if (!existsSync(settingsPath)) return;
  const settings = readSettings(settingsPath);
  if (!settings.hooks) return;
  const next: Record<string, HookEntry[]> = {};
  for (const [event, entries] of Object.entries(settings.hooks)) {
    const kept = entries.filter((e) => !isOurEntry(e, scriptsDir));
    if (kept.length > 0) next[event] = kept;
  }
  if (Object.keys(next).length > 0) {
    settings.hooks = next;
  } else {
    settings.hooks = undefined;
  }
  writeSettings(settingsPath, settings);
}
