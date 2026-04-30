import { spawnSync } from 'node:child_process';
import {
  createReadStream,
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { runIngest } from '../../src/commands/index.js';
import { closeLogger, resetLoggerCacheForTests } from '../../src/output/logger.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PKG_ROOT = resolve(__dirname, '..', '..');
const BIN = resolve(PKG_ROOT, 'dist', 'bin.js');

describe('ingest', () => {
  let dir: string;

  beforeAll(() => {
    if (!existsSync(BIN)) {
      throw new Error(`expected built bin at ${BIN}; run pnpm --filter @batonai/cli build`);
    }
  });

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'baton-ingest-'));
    resetLoggerCacheForTests();
  });
  afterEach(async () => {
    // Close pino's file handle before rmSync; on Windows an open handle
    // blocks `rmdir` of the parent `.baton/logs` directory (`ENOTEMPTY`).
    await closeLogger();
    rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  });

  it('streams a small file source through to the artifact dir', async () => {
    const src = join(dir, 'transcript.md');
    writeFileSync(src, 'hello\nworld\n', 'utf8');
    const code = await runIngest('transcript', src, { repo: dir, packet: 'p1' });
    expect(code).toBe(0);
    const artifacts = readdirSync(join(dir, '.baton', 'artifacts'));
    expect(artifacts.length).toBe(1);
    const id = artifacts[0] as string;
    const meta = JSON.parse(
      readFileSync(join(dir, '.baton', 'artifacts', id, 'metadata.json'), 'utf8'),
    ) as { bytes: number; digest_sha256: string; file: string };
    expect(meta.bytes).toBe('hello\nworld\n'.length);
    expect(meta.digest_sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it('streams stdin (no buffer-everything) for a multi-MB transcript', () => {
    // Fix 4: ingest must stream stdin, not collect into Buffer[].
    // Spawn the built bin with a 6MB stdin payload and verify the
    // resulting artifact bytes + digest match. We use the bin (rather
    // than runIngest) because process.stdin is a real fd here.
    const SIZE = 6 * 1024 * 1024;
    const chunk = Buffer.alloc(64 * 1024, 0x41); // 'A' x 64KB
    const buffers: Buffer[] = [];
    let written = 0;
    while (written < SIZE) {
      const remaining = SIZE - written;
      const slice = remaining >= chunk.length ? chunk : chunk.subarray(0, remaining);
      buffers.push(slice);
      written += slice.length;
    }
    const payload = Buffer.concat(buffers);

    const r = spawnSync(
      process.execPath,
      [BIN, 'ingest', 'transcript', '-', '--repo', dir, '--packet', 'big', '--json'],
      { input: payload, encoding: 'buffer' },
    );
    expect(r.status).toBe(0);

    const artifactsDir = join(dir, '.baton', 'artifacts');
    const ids = readdirSync(artifactsDir);
    expect(ids.length).toBe(1);
    const id = ids[0] as string;
    const stored = join(artifactsDir, id, 'stdin.txt');
    expect(existsSync(stored)).toBe(true);
    expect(statSync(stored).size).toBe(SIZE);

    // Independent digest from a streamed read of the stored artifact.
    return new Promise<void>((resolveP, reject) => {
      // Use createHash via dynamic import to keep the static surface tiny.
      import('node:crypto')
        .then(({ createHash }) => {
          const h = createHash('sha256');
          const stream = createReadStream(stored);
          stream.on('data', (c) => h.update(c));
          stream.on('end', () => {
            const digest = h.digest('hex');
            const meta = JSON.parse(
              readFileSync(join(artifactsDir, id, 'metadata.json'), 'utf8'),
            ) as { bytes: number; digest_sha256: string };
            try {
              expect(meta.bytes).toBe(SIZE);
              expect(meta.digest_sha256).toBe(digest);
              resolveP();
            } catch (e) {
              reject(e as Error);
            }
          });
          stream.on('error', reject);
        })
        .catch(reject);
    });
  }, 30_000);
});
