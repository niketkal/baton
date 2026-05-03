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

const HEADER_RE = /^##\s+(user|assistant|system|tool)\b\s*$/i;
const TS_COMMENT_RE = /<!--\s*ts:\s*([^\s][^>]*?)\s*-->/i;
const FENCE_RE = /^\s*```/;

function uriToPath(uri: string, repoRoot: string | undefined): string {
  if (uri.startsWith('file://')) return fileURLToPath(uri);
  if (isAbsolute(uri)) return uri;
  return resolve(repoRoot ?? process.cwd(), uri);
}

function normalizeRole(s: string): TranscriptRole {
  const r = s.toLowerCase();
  if (r === 'user' || r === 'assistant' || r === 'system' || r === 'tool') return r;
  // Defensive — HEADER_RE only matches the four roles, but TS exhaustiveness
  // wants this branch.
  return 'assistant';
}

interface LineInfo {
  text: string;
  /** Byte offset (inclusive) of this line's first character. */
  start: number;
  /** Byte offset (exclusive) of the line's last character (excludes line terminator). */
  end: number;
}

function splitLinesWithOffsets(content: string): LineInfo[] {
  // Spans are documented as UTF-8 BYTE offsets (not UTF-16 code units), so
  // provenance links into transcripts containing non-ASCII characters
  // (em-dashes, smart quotes, CJK, emoji) point at the right bytes when a
  // downstream consumer slices the file as a Buffer. JavaScript string
  // indexing yields code units, so we accumulate byte cost per line via
  // Buffer.byteLength on each slice.
  const out: LineInfo[] = [];
  const n = content.length;
  let i = 0;
  let byteCursor = 0;
  while (i <= n) {
    const charStart = i;
    let j = i;
    while (j < n && content[j] !== '\n' && content[j] !== '\r') j += 1;
    const text = content.slice(charStart, j);
    const byteStart = byteCursor;
    const byteEnd = byteStart + Buffer.byteLength(text, 'utf8');
    out.push({ text, start: byteStart, end: byteEnd });
    byteCursor = byteEnd;
    if (j >= n) break;
    // Advance past the line terminator and account for its bytes (always 1
    // for "\n" or "\r"; 2 for "\r\n"). All terminators are pure ASCII so
    // the byte cost equals the code-unit cost.
    if (content[j] === '\r' && content[j + 1] === '\n') {
      i = j + 2;
      byteCursor += 2;
    } else {
      i = j + 1;
      byteCursor += 1;
    }
  }
  return out;
}

export function parseClaudeCodeTranscript(content: string): ParsedTranscript {
  const lines = splitLinesWithOffsets(content);
  // rawLength is reported as a byte length so it matches the offset units
  // used by span_start / span_end.
  const rawLength = Buffer.byteLength(content, 'utf8');

  const messages: TranscriptMessage[] = [];
  let currentRole: TranscriptRole | null = null;
  let currentTs: string | undefined;
  let buffer: string[] = [];
  let bodyStart: number | null = null;
  let bodyEnd: number | null = null;
  let inFence = false;

  const flush = (): void => {
    if (currentRole === null) return;
    const text = buffer.join('\n').trim();
    if (text.length === 0 && currentTs === undefined) {
      buffer = [];
      bodyStart = null;
      bodyEnd = null;
      return;
    }
    const msg: TranscriptMessage = { role: currentRole, text };
    if (currentTs !== undefined) msg.ts = currentTs;
    if (bodyStart !== null && bodyEnd !== null) {
      msg.span_start = bodyStart;
      msg.span_end = bodyEnd;
    }
    messages.push(msg);
    buffer = [];
    bodyStart = null;
    bodyEnd = null;
    currentTs = undefined;
  };

  const recordOffsets = (line: LineInfo): void => {
    if (bodyStart === null) bodyStart = line.start;
    bodyEnd = line.end;
  };

  for (const line of lines) {
    // Track fence depth so we don't treat literal "## User" inside a
    // ```-fenced code block as a real role header. The fence line itself
    // is included in the surrounding message body.
    if (FENCE_RE.test(line.text)) {
      inFence = !inFence;
      if (currentRole !== null) {
        buffer.push(line.text);
        recordOffsets(line);
      }
      continue;
    }
    if (!inFence) {
      const headerMatch = line.text.match(HEADER_RE);
      if (headerMatch?.[1] !== undefined) {
        flush();
        currentRole = normalizeRole(headerMatch[1]);
        continue;
      }
    }
    if (currentRole === null) {
      // Pre-header preamble is dropped (front-matter, titles, etc.).
      continue;
    }
    const tsMatch = inFence ? null : line.text.match(TS_COMMENT_RE);
    if (tsMatch?.[1] !== undefined && currentTs === undefined) {
      currentTs = tsMatch[1];
      const stripped = line.text.replace(TS_COMMENT_RE, '').trim();
      if (stripped.length > 0) {
        buffer.push(stripped);
        recordOffsets(line);
      }
      continue;
    }
    buffer.push(line.text);
    recordOffsets(line);
  }
  flush();

  if (messages.length === 0) {
    // No recognized role headers (or all of them were inside fenced
    // code). Fall back to wrapping the whole file as a single assistant
    // message and let the caller surface a warning.
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

/**
 * Detect whether a transcript file is Claude Code's JSONL session
 * format (one JSON object per line, with a top-level `type` field) or
 * the markdown-with-`## role`-header format. We peek at the first
 * non-blank line and look for a JSON object whose top-level keys
 * include `type` — that's the JSONL signal.
 */
function looksLikeJsonl(content: string): boolean {
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (trimmed.length === 0) continue;
    if (!trimmed.startsWith('{')) return false;
    try {
      const obj = JSON.parse(trimmed) as Record<string, unknown>;
      return typeof obj.type === 'string';
    } catch {
      return false;
    }
  }
  return false;
}

export const transcriptParser: Parser<ParsedTranscript> = {
  type: 'transcript',
  async parse(uri: string, opts?: ParserOpts): Promise<ParsedTranscript> {
    const path = uriToPath(uri, opts?.repoRoot);
    const content = await readFile(path, 'utf8');
    if (opts?.signal?.aborted) {
      throw new DOMException('Aborted', 'AbortError');
    }
    if (path.endsWith('.jsonl') || looksLikeJsonl(content)) {
      const { parseClaudeJsonlTranscript } = await import('./jsonl-transcript.js');
      return parseClaudeJsonlTranscript(content);
    }
    return parseClaudeCodeTranscript(content);
  },
};
