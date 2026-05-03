import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { applyHookRegistrations, removeHookRegistrations } from '../../src/claude-code/settings.js';

interface SettingsFile {
  hooks?: Record<
    string,
    Array<{ matcher?: string; hooks?: Array<{ type?: string; command?: string }> }>
  >;
  enabledPlugins?: Record<string, boolean>;
  effortLevel?: string;
}

function readSettings(p: string): SettingsFile {
  return JSON.parse(readFileSync(p, 'utf8')) as SettingsFile;
}

describe('claude-code settings.json patching', () => {
  let workDir: string;
  let settingsPath: string;
  const SCRIPTS_DIR = '/Users/test/.claude/plugins/baton/hooks/';
  const REG = [
    { event: 'PreCompact', command: `${SCRIPTS_DIR}pre-compact.sh` },
    { event: 'Stop', command: `${SCRIPTS_DIR}stop.sh` },
    { event: 'SessionEnd', command: `${SCRIPTS_DIR}session-end.sh` },
  ];

  beforeEach(() => {
    workDir = mkdtempSync(join(tmpdir(), 'baton-settings-test-'));
    settingsPath = join(workDir, 'settings.json');
  });
  afterEach(() => {
    rmSync(workDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
  });

  it('creates settings.json with hooks block when none exists', () => {
    expect(existsSync(settingsPath)).toBe(false);
    applyHookRegistrations(settingsPath, SCRIPTS_DIR, REG);
    expect(existsSync(settingsPath)).toBe(true);
    const written = readSettings(settingsPath);
    expect(Object.keys(written.hooks ?? {})).toEqual(['PreCompact', 'Stop', 'SessionEnd']);
    expect(written.hooks?.PreCompact?.[0]?.hooks?.[0]?.command).toBe(
      `${SCRIPTS_DIR}pre-compact.sh`,
    );
    expect(written.hooks?.PreCompact?.[0]?.matcher).toBe('*');
  });

  it('preserves unrelated keys (enabledPlugins, effortLevel) when patching', () => {
    writeFileSync(
      settingsPath,
      JSON.stringify({
        enabledPlugins: { 'foo@bar': true },
        effortLevel: 'high',
      }),
    );
    applyHookRegistrations(settingsPath, SCRIPTS_DIR, REG);
    const written = readSettings(settingsPath);
    expect(written.enabledPlugins).toEqual({ 'foo@bar': true });
    expect(written.effortLevel).toBe('high');
    expect(written.hooks).toBeDefined();
  });

  it('preserves other-tool hook entries on the same event', () => {
    writeFileSync(
      settingsPath,
      JSON.stringify({
        hooks: {
          PreCompact: [
            {
              matcher: '*',
              hooks: [{ type: 'command', command: '/some/other/tool/hook.sh' }],
            },
          ],
        },
      }),
    );
    applyHookRegistrations(settingsPath, SCRIPTS_DIR, REG);
    const written = readSettings(settingsPath);
    const preCompact = written.hooks?.PreCompact ?? [];
    expect(preCompact).toHaveLength(2);
    const commands = preCompact.flatMap((e) => e.hooks?.map((h) => h.command) ?? []);
    expect(commands).toContain('/some/other/tool/hook.sh');
    expect(commands).toContain(`${SCRIPTS_DIR}pre-compact.sh`);
  });

  it('is idempotent: re-running does not duplicate baton entries', () => {
    applyHookRegistrations(settingsPath, SCRIPTS_DIR, REG);
    applyHookRegistrations(settingsPath, SCRIPTS_DIR, REG);
    applyHookRegistrations(settingsPath, SCRIPTS_DIR, REG);
    const written = readSettings(settingsPath);
    expect(written.hooks?.PreCompact).toHaveLength(1);
    expect(written.hooks?.Stop).toHaveLength(1);
    expect(written.hooks?.SessionEnd).toHaveLength(1);
  });

  it('removeHookRegistrations strips baton entries and leaves others', () => {
    writeFileSync(
      settingsPath,
      JSON.stringify({
        hooks: {
          PreCompact: [
            { matcher: '*', hooks: [{ type: 'command', command: '/some/other/tool.sh' }] },
          ],
        },
        enabledPlugins: { 'foo@bar': true },
      }),
    );
    applyHookRegistrations(settingsPath, SCRIPTS_DIR, REG);
    removeHookRegistrations(settingsPath, SCRIPTS_DIR);
    const written = readSettings(settingsPath);
    expect(written.enabledPlugins).toEqual({ 'foo@bar': true });
    const preCompact = written.hooks?.PreCompact ?? [];
    expect(preCompact).toHaveLength(1);
    expect(preCompact[0]?.hooks?.[0]?.command).toBe('/some/other/tool.sh');
    expect(written.hooks?.Stop).toBeUndefined();
    expect(written.hooks?.SessionEnd).toBeUndefined();
  });

  it('removeHookRegistrations drops the empty hooks key when nothing else remains', () => {
    applyHookRegistrations(settingsPath, SCRIPTS_DIR, REG);
    removeHookRegistrations(settingsPath, SCRIPTS_DIR);
    const written = readSettings(settingsPath);
    expect(written.hooks).toBeUndefined();
  });

  it('removeHookRegistrations is a no-op when settings.json does not exist', () => {
    expect(() => removeHookRegistrations(settingsPath, SCRIPTS_DIR)).not.toThrow();
  });

  it('refuses to patch a settings.json that is not valid JSON', () => {
    writeFileSync(settingsPath, '{ broken');
    expect(() => applyHookRegistrations(settingsPath, SCRIPTS_DIR, REG)).toThrow(/not valid JSON/);
  });
});
