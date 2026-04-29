import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runCompile } from '../../src/commands/compile.js';
import { closeLogger, resetLoggerCacheForTests } from '../../src/output/logger.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SHARED_FIXTURE = join(
  __dirname,
  '..',
  '..',
  '..',
  'compiler',
  'test',
  'fixtures',
  'transcript-claude-code-01.md',
);

// Regression: cli commands used to call `PacketStore.open(join(repoRoot,
// '.baton'))` while resolvePaths() also appended `BATON_DIR`, so packets
// landed at `<repoRoot>/.baton/.baton/packets/<id>/`. PacketStore.open
// takes the repo root; the store appends `.baton` itself.
describe('compile: packet store path', () => {
  let dir: string;
  let stdout: ReturnType<typeof vi.spyOn>;
  let stderr: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'baton-double-baton-'));
    resetLoggerCacheForTests();
    stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const artDir = join(dir, '.baton', 'artifacts', 'art-001');
    mkdirSync(artDir, { recursive: true });
    writeFileSync(
      join(artDir, 'metadata.json'),
      JSON.stringify({ id: 'art-001', kind: 'transcript', file: 'transcript.md' }),
    );
    writeFileSync(join(artDir, 'transcript.md'), readFileSync(SHARED_FIXTURE, 'utf8'));
  });

  afterEach(async () => {
    stdout.mockRestore();
    stderr.mockRestore();
    await closeLogger();
    rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  });

  it('writes packets at <repo>/.baton/packets/<id>/, not <repo>/.baton/.baton/packets/<id>/', async () => {
    const code = await runCompile({ packet: 'smoke', mode: 'fast', repo: dir });
    expect(code).toBe(0);
    expect(existsSync(join(dir, '.baton', 'packets', 'smoke', 'packet.json'))).toBe(true);
    expect(existsSync(join(dir, '.baton', '.baton'))).toBe(false);
  });
});
