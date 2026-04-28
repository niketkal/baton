import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { transcriptParser } from '../../src/parsers/transcript.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES = join(__dirname, '..', 'fixtures');

describe('parseClaudeCodeTranscript', () => {
  it('parses role headers and timestamp comments', async () => {
    const parsed = await transcriptParser.parse(join(FIXTURES, 'transcript-claude-code-01.md'));
    expect(parsed.tool).toBe('claude-code');
    expect(parsed.unrecognized).toBe(false);
    expect(parsed.messages.length).toBeGreaterThanOrEqual(5);
    const roles = parsed.messages.map((m) => m.role);
    expect(roles).toContain('user');
    expect(roles).toContain('assistant');
    expect(roles).toContain('tool');
    const timestamps = parsed.messages.filter((m) => m.ts !== undefined);
    expect(timestamps.length).toBeGreaterThanOrEqual(2);
    expect(timestamps[0]?.ts).toMatch(/2026-04-26T10:00:00Z/);
  });

  it('falls back to a single assistant message for unrecognized format', async () => {
    const parsed = await transcriptParser.parse(join(FIXTURES, 'transcript-unrecognized-01.md'));
    expect(parsed.unrecognized).toBe(true);
    expect(parsed.messages).toHaveLength(1);
    expect(parsed.messages[0]?.role).toBe('assistant');
    expect(parsed.messages[0]?.text.length).toBeGreaterThan(0);
  });

  it('honors AbortSignal raised before parse completes', async () => {
    const ctrl = new AbortController();
    ctrl.abort();
    await expect(
      transcriptParser.parse(join(FIXTURES, 'transcript-claude-code-01.md'), {
        signal: ctrl.signal,
      }),
    ).rejects.toMatchObject({ name: 'AbortError' });
  });
});
