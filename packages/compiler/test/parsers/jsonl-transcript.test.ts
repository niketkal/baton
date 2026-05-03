import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parseClaudeJsonlTranscript } from '../../src/parsers/jsonl-transcript.js';
import { transcriptParser } from '../../src/parsers/transcript.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES = join(__dirname, '..', 'fixtures');
const JSONL_FIXTURE = join(FIXTURES, 'transcript-claude-code-jsonl-01.jsonl');

describe('parseClaudeJsonlTranscript', () => {
  it('extracts user and assistant messages, skips non-message lines', async () => {
    const { readFile } = await import('node:fs/promises');
    const content = await readFile(JSONL_FIXTURE, 'utf8');
    const parsed = parseClaudeJsonlTranscript(content);
    expect(parsed.tool).toBe('claude-code');
    expect(parsed.unrecognized).toBe(false);
    // 2 user + 2 assistant lines should produce text; the permission-mode
    // line is dropped, the thinking block is dropped from the assistant.
    const roles = parsed.messages.map((m) => m.role);
    expect(roles).toEqual(['user', 'assistant', 'user', 'assistant']);
  });

  it('drops thinking blocks and keeps text + tool placeholders', async () => {
    const { readFile } = await import('node:fs/promises');
    const content = await readFile(JSONL_FIXTURE, 'utf8');
    const parsed = parseClaudeJsonlTranscript(content);
    const firstAssistant = parsed.messages.find((m) => m.role === 'assistant');
    expect(firstAssistant?.text).toBe('hi back');
    expect(firstAssistant?.text).not.toContain('internal');
    const lastAssistant = parsed.messages.filter((m) => m.role === 'assistant').at(-1);
    expect(lastAssistant?.text).toContain('[tool: Read]');
    const toolResultUser = parsed.messages.find((m) => m.text.includes('[tool_result]'));
    expect(toolResultUser?.role).toBe('user');
  });

  it('captures timestamps and byte-offset spans', async () => {
    const { readFile } = await import('node:fs/promises');
    const content = await readFile(JSONL_FIXTURE, 'utf8');
    const parsed = parseClaudeJsonlTranscript(content);
    expect(parsed.rawLength).toBe(Buffer.byteLength(content, 'utf8'));
    for (const m of parsed.messages) {
      expect(typeof m.ts).toBe('string');
      expect(m.span_start ?? -1).toBeGreaterThanOrEqual(0);
      expect(m.span_end ?? -1).toBeGreaterThan(m.span_start ?? 0);
      expect(m.span_end ?? -1).toBeLessThanOrEqual(parsed.rawLength);
    }
  });

  it('falls back to a single assistant message for unrecognized JSONL', () => {
    const parsed = parseClaudeJsonlTranscript(
      '{"type":"permission-mode","permissionMode":"default"}\n',
    );
    expect(parsed.unrecognized).toBe(true);
    expect(parsed.messages).toHaveLength(1);
    expect(parsed.messages[0]?.role).toBe('assistant');
  });

  it('skips malformed JSON lines without crashing', () => {
    const broken = [
      'not json at all',
      '{"type":"user","message":{"role":"user","content":"hi"}}',
      '{ broken json',
    ].join('\n');
    const parsed = parseClaudeJsonlTranscript(broken);
    expect(parsed.unrecognized).toBe(false);
    expect(parsed.messages).toHaveLength(1);
    expect(parsed.messages[0]?.text).toBe('hi');
  });
});

describe('transcriptParser dispatcher', () => {
  it('routes .jsonl files to the JSONL parser', async () => {
    const parsed = await transcriptParser.parse(JSONL_FIXTURE);
    expect(parsed.tool).toBe('claude-code');
    expect(parsed.unrecognized).toBe(false);
    // Markdown parser would have tagged this as unrecognized since
    // there are no `## role` headers. JSONL parser returns real messages.
    expect(parsed.messages.length).toBeGreaterThan(1);
  });

  it('routes markdown transcripts to the markdown parser', async () => {
    const parsed = await transcriptParser.parse(join(FIXTURES, 'transcript-claude-code-01.md'));
    expect(parsed.tool).toBe('claude-code');
    expect(parsed.unrecognized).toBe(false);
    expect(parsed.messages.some((m) => m.role === 'tool')).toBe(true);
  });
});
