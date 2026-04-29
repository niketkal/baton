import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { dryRun } from '../../src/cursor/dry-run.js';
import { cursorIntegration } from '../../src/cursor/index.js';
import { install } from '../../src/cursor/install.js';
import { status } from '../../src/cursor/status.js';
import { uninstall } from '../../src/cursor/uninstall.js';

describe('cursor paste-only integration', () => {
  let repoRoot: string;

  beforeEach(() => {
    repoRoot = mkdtempSync(join(tmpdir(), 'baton-cursor-'));
  });

  afterEach(() => {
    rmSync(repoRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
  });

  it('declares paste-only mode in its Integration descriptor', () => {
    expect(cursorIntegration.id).toBe('cursor');
    expect(cursorIntegration.preferredMode).toBe('paste');
    expect(cursorIntegration.modes).toContain('paste');
  });

  it('dryRun reports zero files', async () => {
    const plan = await dryRun({ repoRoot });
    expect(plan.filesCreated.length).toBe(0);
    expect(plan.mode).toBe('paste');
    expect(plan.warnings.length).toBeGreaterThan(0);
  });

  it('install writes no plugin files; uninstall removes the manifest entry', async () => {
    await install({ repoRoot });
    // The integration manifest exists and includes cursor.
    const s = await status({ repoRoot });
    expect(s).not.toBeNull();
    expect(s?.id).toBe('cursor');
    expect(s?.mode).toBe('paste');

    // No plugin tree.
    const integrationsDir = join(repoRoot, '.baton', 'integrations');
    const entries = readdirSync(integrationsDir);
    expect(entries).toContain('installed.json');
    // No subdirectories created beyond the manifest.
    expect(entries.length).toBe(1);

    await uninstall({ repoRoot });
    const after = await status({ repoRoot });
    expect(after).toBeNull();
    expect(existsSync(integrationsDir)).toBe(true); // manifest still there, just empty
  });
});
