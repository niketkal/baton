import { readFile } from 'node:fs/promises';
import { isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ParsedTranscript, Parser, ParserOpts, TranscriptMessage } from './types.js';

function uriToPath(uri: string, repoRoot: string | undefined): string {
  if (uri.startsWith('file://')) return fileURLToPath(uri);
  if (isAbsolute(uri)) return uri;
  return resolve(repoRoot ?? process.cwd(), uri);
}

interface RollOutLine {
  type?: string;
  timestamp?: string;
  payload?: Record<string, unknown>;
}

const TOOL_OUTPUT_CAP = 500;

function asString(v: unknown): string | null {
  return typeof v === 'string' ? v : null;
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return `${s.slice(0, max)}… [truncated]`;
}

/**
 * Parse a codex rollout JSONL file (`~/.codex/sessions/.../rollout-*.jsonl`).
 *
 * The rollout format carries the same conversation in two places: clean
 * text via `event_msg` (`user_message` / `agent_message`) and richer
 * structured turns via `response_item.message`. We use `event_msg` for
 * the canonical user/assistant text (cleaner, no developer/environment
 * wrappers) and `response_item` only for tool placeholders. `reasoning`
 * blocks are dropped — they hold encrypted_content with no human text.
 */
export function parseCodexRolloutTranscript(content: string): ParsedTranscript {
  const rawLength = Buffer.byteLength(content, 'utf8');
  const messages: TranscriptMessage[] = [];

  let cursor = 0;
  const lines = content.split('\n');
  for (const rawLine of lines) {
    const lineBytes = Buffer.byteLength(rawLine, 'utf8');
    const lineStart = cursor;
    const lineEnd = cursor + lineBytes;
    cursor = lineEnd + 1;

    const trimmed = rawLine.trim();
    if (trimmed.length === 0) continue;
    if (!trimmed.startsWith('{')) continue;

    let parsed: RollOutLine;
    try {
      parsed = JSON.parse(trimmed) as RollOutLine;
    } catch {
      continue;
    }

    const t = parsed.type;
    const p = parsed.payload ?? {};
    let role: TranscriptMessage['role'] | null = null;
    let text = '';

    if (t === 'event_msg') {
      const pt = asString(p.type);
      if (pt === 'user_message') {
        role = 'user';
        text = asString(p.message) ?? '';
      } else if (pt === 'agent_message') {
        role = 'assistant';
        text = asString(p.message) ?? '';
      }
    } else if (t === 'response_item') {
      const pt = asString(p.type);
      if (pt === 'function_call' || pt === 'custom_tool_call') {
        role = 'assistant';
        const name = asString(p.name) ?? 'tool';
        text = `[tool: ${name}]`;
      } else if (pt === 'web_search_call') {
        role = 'assistant';
        text = '[tool: web_search]';
      } else if (pt === 'function_call_output' || pt === 'custom_tool_call_output') {
        role = 'tool';
        const out = asString(p.output) ?? '';
        if (out.length === 0) continue;
        text = `[tool_result] ${truncate(out, TOOL_OUTPUT_CAP)}`;
      }
      // message / reasoning intentionally dropped — message duplicates
      // event_msg text (and adds developer/environment_context noise);
      // reasoning carries only encrypted_content.
    }
    // session_meta, turn_context, and other event_msg subtypes
    // (task_started, token_count, task_complete) are skipped.

    if (role === null || text.length === 0) continue;

    const msg: TranscriptMessage = {
      role,
      text,
      span_start: lineStart,
      span_end: lineEnd,
    };
    if (typeof parsed.timestamp === 'string') msg.ts = parsed.timestamp;
    messages.push(msg);
  }

  if (messages.length === 0) {
    return {
      tool: 'codex',
      messages: [
        {
          role: 'assistant',
          text: content.trim(),
          span_start: 0,
          span_end: rawLength,
        },
      ],
      rawLength,
      rawText: content,
      unrecognized: true,
    };
  }

  return {
    tool: 'codex',
    messages,
    rawLength,
    rawText: content,
    unrecognized: false,
  };
}

export const codexRolloutParser: Parser<ParsedTranscript> = {
  type: 'transcript',
  async parse(uri: string, opts?: ParserOpts): Promise<ParsedTranscript> {
    const path = uriToPath(uri, opts?.repoRoot);
    const content = await readFile(path, 'utf8');
    if (opts?.signal?.aborted) {
      throw new DOMException('Aborted', 'AbortError');
    }
    return parseCodexRolloutTranscript(content);
  },
};
