import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runRender } from '../../src/commands/render.js';
import { closeLogger, resetLoggerCacheForTests } from '../../src/output/logger.js';

describe('render — missing packet handling', () => {
  let dir: string;
  let stdout: ReturnType<typeof vi.spyOn>;
  let stderr: ReturnType<typeof vi.spyOn>;
  let stderrText: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'baton-render-missing-'));
    resetLoggerCacheForTests();
    stderrText = '';
    stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    stderr = vi.spyOn(process.stderr, 'write').mockImplementation((s: unknown) => {
      stderrText += typeof s === 'string' ? s : (s as Buffer).toString('utf8');
      return true;
    });
  });

  afterEach(async () => {
    stdout.mockRestore();
    stderr.mockRestore();
    await closeLogger();
    rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
  });

  it('exits 1 (user error) with a clean message, not 3 (internal)', async () => {
    const code = await runRender({
      packet: 'does-not-exist',
      target: 'generic',
      repo: dir,
    });
    expect(code).toBe(1);
    expect(stderrText.toLowerCase()).toMatch(/packet|not found|enoent/);
  });

  it('does NOT downgrade malformed packet.json to exit 1 — corruption should escape', async () => {
    // Seed a packet directory with a packet.json that exists but is
    // not parseable JSON. PacketStore.read() throws SyntaxError;
    // that's data-corruption, not operator typo, so the render
    // command must let the exception escape so main.ts can map it
    // to exit-3. Otherwise broken canonical state silently looks
    // like a typo and the user never knows their on-disk packet
    // has decayed.
    mkdirSync(join(dir, '.baton', 'packets', 'corrupt'), { recursive: true });
    writeFileSync(
      join(dir, '.baton', 'packets', 'corrupt', 'packet.json'),
      'this is not json{{{',
      'utf8',
    );
    await expect(runRender({ packet: 'corrupt', target: 'generic', repo: dir })).rejects.toThrow();
  });
});
