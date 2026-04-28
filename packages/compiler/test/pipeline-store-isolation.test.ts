import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { compile } from '../src/pipeline.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE = join(__dirname, 'fixtures', 'transcript-claude-code-01.md');

let tmp: string;
beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'baton-compiler-iso-'));
});
afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

describe('compile with storeRoot=false', () => {
  it('returns the packet without creating .baton/', async () => {
    const result = await compile({
      packetId: 'demo',
      repoRoot: tmp,
      mode: 'fast',
      storeRoot: false,
      artifacts: [{ type: 'transcript', uri: FIXTURE }],
    });
    expect(result.packet.id).toBe('demo');
    expect(existsSync(join(tmp, '.baton'))).toBe(false);
  });
});
