import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parseCodexRolloutTranscript } from '../../src/parsers/codex-rollout.js';
import { transcriptParser } from '../../src/parsers/transcript.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES = join(__dirname, '..', 'fixtures');
const CODEX_FIXTURE = join(FIXTURES, 'transcript-codex-rollout-01.jsonl');
const CLAUDE_JSONL_FIXTURE = join(FIXTURES, 'transcript-claude-code-jsonl-01.jsonl');

describe('parseCodexRolloutTranscript', () => {
  it('extracts user/assistant messages from event_msg and tool placeholders from response_item', async () => {
    const content = await readFile(CODEX_FIXTURE, 'utf8');
    const parsed = parseCodexRolloutTranscript(content);
    expect(parsed.tool).toBe('codex');
    expect(parsed.unrecognized).toBe(false);
    const roles = parsed.messages.map((m) => m.role);
    // user prompt, agent_message, function_call (assistant placeholder),
    // function_call_output (tool), web_search_call (assistant placeholder),
    // second agent_message.
    expect(roles).toEqual(['user', 'assistant', 'assistant', 'tool', 'assistant', 'assistant']);
    expect(parsed.messages[0]?.text).toBe('review android rollout spec');
    expect(parsed.messages[1]?.text).toBe("I'll find the spec and review it.");
  });

  it('drops reasoning blocks (encrypted_content never leaks)', async () => {
    const content = await readFile(CODEX_FIXTURE, 'utf8');
    const parsed = parseCodexRolloutTranscript(content);
    for (const m of parsed.messages) {
      expect(m.text).not.toContain('SECRET_DO_NOT_LEAK');
    }
  });

  it('skips response_item.message to avoid duplicating event_msg text', async () => {
    const content = await readFile(CODEX_FIXTURE, 'utf8');
    const parsed = parseCodexRolloutTranscript(content);
    const firstReview = parsed.messages.filter((m) =>
      m.text.includes("I'll find the spec and review it."),
    );
    expect(firstReview).toHaveLength(1);
  });

  it('emits tool placeholders and truncates long tool output', () => {
    const longOutput = 'x'.repeat(2000);
    const content = [
      JSON.stringify({
        type: 'event_msg',
        payload: { type: 'user_message', message: 'go' },
      }),
      JSON.stringify({
        type: 'response_item',
        payload: { type: 'function_call', name: 'exec_command' },
      }),
      JSON.stringify({
        type: 'response_item',
        payload: { type: 'function_call_output', output: longOutput },
      }),
    ].join('\n');
    const parsed = parseCodexRolloutTranscript(content);
    expect(parsed.messages[1]?.text).toBe('[tool: exec_command]');
    const toolResult = parsed.messages[2]?.text ?? '';
    expect(toolResult.startsWith('[tool_result] ')).toBe(true);
    expect(toolResult).toContain('[truncated]');
    expect(toolResult.length).toBeLessThan(longOutput.length);
  });

  it('captures timestamps and byte-offset spans within rawLength', async () => {
    const content = await readFile(CODEX_FIXTURE, 'utf8');
    const parsed = parseCodexRolloutTranscript(content);
    expect(parsed.rawLength).toBe(Buffer.byteLength(content, 'utf8'));
    for (const m of parsed.messages) {
      expect(typeof m.ts).toBe('string');
      expect(m.span_start ?? -1).toBeGreaterThanOrEqual(0);
      expect(m.span_end ?? -1).toBeGreaterThan(m.span_start ?? 0);
      expect(m.span_end ?? -1).toBeLessThanOrEqual(parsed.rawLength);
    }
  });

  it('falls back to a single assistant message for empty rollouts', () => {
    const parsed = parseCodexRolloutTranscript('{"type":"session_meta","payload":{"id":"x"}}\n');
    expect(parsed.unrecognized).toBe(true);
    expect(parsed.messages).toHaveLength(1);
    expect(parsed.tool).toBe('codex');
  });
});

describe('transcriptParser dispatcher — codex routing', () => {
  it('routes codex rollout to the codex parser', async () => {
    const parsed = await transcriptParser.parse(CODEX_FIXTURE);
    expect(parsed.tool).toBe('codex');
    expect(parsed.unrecognized).toBe(false);
    expect(parsed.messages.some((m) => m.text === 'review android rollout spec')).toBe(true);
  });

  it('still routes claude-code JSONL to the claude parser', async () => {
    const parsed = await transcriptParser.parse(CLAUDE_JSONL_FIXTURE);
    expect(parsed.tool).toBe('claude-code');
    expect(parsed.unrecognized).toBe(false);
  });
});
