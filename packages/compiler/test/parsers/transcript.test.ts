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

  it('does not treat role headers inside fenced code blocks as messages', async () => {
    const parsed = await transcriptParser.parse(join(FIXTURES, 'transcript-with-fenced-header.md'));
    expect(parsed.unrecognized).toBe(false);
    const userMessages = parsed.messages.filter((m) => m.role === 'user');
    const assistantMessages = parsed.messages.filter((m) => m.role === 'assistant');
    expect(userMessages).toHaveLength(1);
    expect(assistantMessages).toHaveLength(1);
    // The literal "## Assistant" / "## User" inside fences should appear
    // as content of the surrounding user message, not as their own messages.
    expect(userMessages[0]?.text).toContain('## Assistant');
    expect(userMessages[0]?.text).toContain('## User');
  });

  it('computes byte offset spans for each message body', async () => {
    const parsed = await transcriptParser.parse(join(FIXTURES, 'transcript-claude-code-01.md'));
    expect(parsed.rawText).toBeDefined();
    const raw = parsed.rawText ?? '';
    expect(raw.length).toBe(parsed.rawLength);
    for (const m of parsed.messages) {
      expect(typeof m.span_start).toBe('number');
      expect(typeof m.span_end).toBe('number');
      expect(m.span_start ?? -1).toBeGreaterThanOrEqual(0);
      expect(m.span_end ?? -1).toBeGreaterThan(m.span_start ?? 0);
      expect(m.span_end ?? -1).toBeLessThanOrEqual(parsed.rawLength);
      // The byte slice should contain at least the first word of the
      // trimmed message text — span_start/span_end keep line terminators
      // and the leading newline, so the slice is a superset of m.text.
      const slice = raw.slice(m.span_start ?? 0, m.span_end ?? 0);
      const firstWord = m.text.split(/\s+/)[0] ?? '';
      if (firstWord.length > 0) expect(slice).toContain(firstWord);
    }
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
