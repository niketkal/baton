import { readFile } from 'node:fs/promises';
import { isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type {
  ParsedTranscript,
  Parser,
  ParserOpts,
  TranscriptMessage,
  TranscriptRole,
} from './types.js';

function uriToPath(uri: string, repoRoot: string | undefined): string {
  if (uri.startsWith('file://')) return fileURLToPath(uri);
  if (isAbsolute(uri)) return uri;
  return resolve(repoRoot ?? process.cwd(), uri);
}

function normalizeRole(s: unknown): TranscriptRole | null {
  if (typeof s !== 'string') return null;
  const r = s.toLowerCase();
  if (r === 'user' || r === 'assistant' || r === 'system' || r === 'tool') return r;
  return null;
}

interface ContentBlock {
  type?: string;
  text?: string;
  thinking?: string;
  name?: string;
  input?: unknown;
  content?: unknown;
}

function isContentBlock(v: unknown): v is ContentBlock {
  return typeof v === 'object' && v !== null;
}

/**
 * Extract human-readable text from Claude Code's content array. Drops
 * `thinking` blocks (internal monologue, verbose, not useful for handoff).
 * Collapses tool_use and tool_result into compact placeholders so the
 * next agent can see what tools fired without copying full payloads.
 */
function extractText(content: unknown): string {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  const parts: string[] = [];
  for (const block of content) {
    if (!isContentBlock(block)) continue;
    if (block.type === 'text' && typeof block.text === 'string') {
      parts.push(block.text);
    } else if (block.type === 'tool_use' && typeof block.name === 'string') {
      parts.push(`[tool: ${block.name}]`);
    } else if (block.type === 'tool_result') {
      const inner = extractText(block.content);
      if (inner.length > 0) parts.push(`[tool_result] ${inner}`);
    }
    // thinking blocks intentionally dropped
  }
  return parts.join('\n').trim();
}

interface RawJsonlLine {
  type?: string;
  message?: { role?: string; content?: unknown };
  timestamp?: string;
  uuid?: string;
}

/**
 * Parse a Claude Code session transcript in JSONL format. Each line is
 * a JSON object describing one event; we only surface lines whose
 * top-level `type` is `user` or `assistant` and whose `message.role` is
 * a recognized transcript role. Non-message lines (permission-mode,
 * hook attachments, etc.) are skipped.
 *
 * Span offsets are byte offsets into the raw .jsonl file pointing at the
 * full line for each emitted message. Provenance can quote the line
 * verbatim if needed.
 */
export function parseClaudeJsonlTranscript(content: string): ParsedTranscript {
  const rawLength = Buffer.byteLength(content, 'utf8');
  const messages: TranscriptMessage[] = [];

  let cursor = 0;
  const lines = content.split('\n');
  for (const rawLine of lines) {
    const lineBytes = Buffer.byteLength(rawLine, 'utf8');
    const lineStart = cursor;
    const lineEnd = cursor + lineBytes;
    // Advance cursor past line + the '\n' separator (1 byte). The final
    // line may not have a trailing newline; that's fine — we just don't
    // consume an extra byte for it.
    cursor = lineEnd + 1;

    const trimmed = rawLine.trim();
    if (trimmed.length === 0) continue;
    if (!trimmed.startsWith('{')) continue;

    let parsed: RawJsonlLine;
    try {
      parsed = JSON.parse(trimmed) as RawJsonlLine;
    } catch {
      continue;
    }

    const topType = parsed.type;
    if (topType !== 'user' && topType !== 'assistant') continue;

    const role = normalizeRole(parsed.message?.role) ?? normalizeRole(topType);
    if (role === null) continue;

    const text = extractText(parsed.message?.content);
    if (text.length === 0) continue;

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
      tool: 'claude-code',
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
    tool: 'claude-code',
    messages,
    rawLength,
    rawText: content,
    unrecognized: false,
  };
}

export const jsonlTranscriptParser: Parser<ParsedTranscript> = {
  type: 'transcript',
  async parse(uri: string, opts?: ParserOpts): Promise<ParsedTranscript> {
    const path = uriToPath(uri, opts?.repoRoot);
    const content = await readFile(path, 'utf8');
    if (opts?.signal?.aborted) {
      throw new DOMException('Aborted', 'AbortError');
    }
    return parseClaudeJsonlTranscript(content);
  },
};
