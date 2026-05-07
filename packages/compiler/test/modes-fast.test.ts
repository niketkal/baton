import { describe, expect, it } from 'vitest';
import { type NormalizedInput, runFastMode } from '../src/modes.js';
import type { ParsedTranscript } from '../src/parsers/types.js';

const ctx = {
  packetId: 'test',
  repoCtx: { attached: false } as const,
  now: '2026-05-07T00:00:00Z',
};

function transcript(messages: ParsedTranscript['messages']): NormalizedInput {
  return {
    transcript: {
      tool: 'codex',
      messages,
      rawLength: 1000,
      unrecognized: false,
    },
  };
}

describe('runFastMode current_state extraction', () => {
  it('skips tool placeholders when picking the most recent assistant message', () => {
    // Realistic codex rollout shape: prose plan, then a tool call at the
    // very end of the conversation. The prior bug was that lastAssistant
    // grabbed the tool placeholder instead of the prose plan above it.
    const input = transcript([
      { role: 'user', text: 'fix the IPEDS pipeline' },
      {
        role: 'assistant',
        text: "Here's my plan: 1) confirm mappings, 2) patch the importer, 3) update tests.",
      },
      { role: 'assistant', text: '[tool: exec_command]' },
      { role: 'tool', text: '[tool_result] ok' },
      { role: 'assistant', text: '[tool: read_file]' },
    ]);
    const result = runFastMode(input, null, ctx);
    expect(result.packet.current_state).toContain('plan');
    expect(result.packet.current_state).toContain('confirm mappings');
    expect(result.packet.current_state).not.toMatch(/^\[tool:/);
    expect(result.packet.current_state).not.toContain('[tool_result]');
  });

  it('falls back to the placeholder copy only when no prose assistant turn exists', () => {
    const input = transcript([
      { role: 'user', text: 'try this' },
      { role: 'assistant', text: '[tool: exec_command]' },
      { role: 'tool', text: '[tool_result] ok' },
    ]);
    const result = runFastMode(input, null, ctx);
    expect(result.packet.current_state).toBe('No assistant activity captured yet.');
  });

  it('still picks tool-placeholder-free prose when it is the only assistant text', () => {
    const input = transcript([
      { role: 'user', text: 'do the thing' },
      { role: 'assistant', text: 'Done — all tests pass.' },
    ]);
    const result = runFastMode(input, null, ctx);
    expect(result.packet.current_state).toBe('Done — all tests pass.');
  });

  it('treats messages whose entire text is a tool placeholder as non-prose, not partial matches', () => {
    // A message that *mentions* "[tool: x]" inline should still count as
    // prose — the filter should match only when the entire message body
    // is the placeholder.
    const input = transcript([
      { role: 'user', text: 'q' },
      { role: 'assistant', text: 'I ran the [tool: rg] search and found three matches.' },
      { role: 'assistant', text: '[tool: exec_command]' },
    ]);
    const result = runFastMode(input, null, ctx);
    expect(result.packet.current_state).toContain('three matches');
  });
});
