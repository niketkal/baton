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

export function parseClaudeCodeTranscript(content: string): ParsedTranscript {
  const lines = content.split(/\r?\n/);
  const rawLength = content.length;

  const messages: TranscriptMessage[] = [];
  let currentRole: TranscriptRole | null = null;
  let currentTs: string | undefined;
  let buffer: string[] = [];
  let inFence = false;

  const flush = (): void => {
    if (currentRole === null) return;
    const text = buffer.join('\n').trim();
    if (text.length === 0 && currentTs === undefined) return;
    const msg: TranscriptMessage = { role: currentRole, text };
    if (currentTs !== undefined) msg.ts = currentTs;
    messages.push(msg);
    buffer = [];
    currentTs = undefined;
  };

  for (const line of lines) {
    // Track fence depth so we don't treat literal "## User" inside a
    // ```-fenced code block as a real role header. The fence line itself
    // is included in the surrounding message body.
    if (FENCE_RE.test(line)) {
      inFence = !inFence;
      if (currentRole !== null) buffer.push(line);
      continue;
    }
    if (!inFence) {
      const headerMatch = line.match(HEADER_RE);
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
    const tsMatch = inFence ? null : line.match(TS_COMMENT_RE);
    if (tsMatch?.[1] !== undefined && currentTs === undefined) {
      currentTs = tsMatch[1];
      const stripped = line.replace(TS_COMMENT_RE, '').trim();
      if (stripped.length > 0) buffer.push(stripped);
      continue;
    }
    buffer.push(line);
  }
  flush();

  if (messages.length === 0) {
    // No recognized role headers (or all of them were inside fenced
    // code). Fall back to wrapping the whole file as a single assistant
    // message and let the caller surface a warning.
    return {
      tool: 'claude-code',
      messages: [{ role: 'assistant', text: content.trim() }],
      rawLength,
      unrecognized: true,
    };
  }

  return {
    tool: 'claude-code',
    messages,
    rawLength,
    unrecognized: false,
  };
}

export const transcriptParser: Parser<ParsedTranscript> = {
  type: 'transcript',
  async parse(uri: string, opts?: ParserOpts): Promise<ParsedTranscript> {
    const path = uriToPath(uri, opts?.repoRoot);
    const content = await readFile(path, 'utf8');
    if (opts?.signal?.aborted) {
      throw new DOMException('Aborted', 'AbortError');
    }
    return parseClaudeCodeTranscript(content);
  },
};
