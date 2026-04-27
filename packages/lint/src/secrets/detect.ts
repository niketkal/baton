import { SECRET_PREFIXES } from './prefixes.js';

export type SecretMatchKind = 'prefix' | 'pem' | 'env' | 'entropy';

export interface SecretMatch {
  kind: SecretMatchKind;
  match: string;
  offset: number;
  length: number;
}

const PEM_REGEX = /-----BEGIN [A-Z ]+ PRIVATE KEY-----/g;
const ENV_LINE_REGEX = /^[A-Z][A-Z0-9_]{3,}=\S{8,}$/;
const ENTROPY_CONTEXT_TERMS = ['password', 'secret', 'token', 'key', 'auth'];
const TOKEN_BOUNDARY = /[\s,;'"`<>(){}\[\]]/;

function shannonEntropy(s: string): number {
  if (s.length === 0) return 0;
  const counts = new Map<string, number>();
  for (const ch of s) counts.set(ch, (counts.get(ch) ?? 0) + 1);
  let h = 0;
  for (const c of counts.values()) {
    const p = c / s.length;
    h -= p * Math.log2(p);
  }
  return h;
}

/**
 * Walk `text` and yield `{ token, offset }` for each whitespace/punctuation
 * bounded run of characters.
 */
function* tokenize(text: string): Generator<{ token: string; offset: number }> {
  let start = -1;
  for (let i = 0; i <= text.length; i++) {
    const ch = i < text.length ? text[i] : undefined;
    const isBoundary = ch === undefined || (ch !== undefined && TOKEN_BOUNDARY.test(ch));
    if (isBoundary) {
      if (start >= 0) {
        yield { token: text.slice(start, i), offset: start };
        start = -1;
      }
    } else if (start < 0) {
      start = i;
    }
  }
}

/**
 * Detect apparent secrets in `text` via four heuristics:
 *   1. prefix match against `SECRET_PREFIXES` (token must be ≥ 16 chars)
 *   2. PEM private key markers
 *   3. `.env`-style assignments (per line)
 *   4. high-entropy tokens (≥ 20 chars, entropy ≥ 4.0) near sensitive terms
 *
 * Returns matches in source order. Heuristics may overlap; callers should
 * dedupe by `(offset, length)` if they care.
 */
export function detectSecrets(text: string): SecretMatch[] {
  if (typeof text !== 'string' || text.length === 0) return [];
  const matches: SecretMatch[] = [];
  const lower = text.toLowerCase();

  // 2. PEM markers (cheap; do first so they appear in source order alongside others)
  for (const m of text.matchAll(PEM_REGEX)) {
    if (m.index === undefined) continue;
    matches.push({ kind: 'pem', match: m[0], offset: m.index, length: m[0].length });
  }

  // 3. .env-style assignments (line-oriented)
  let lineStart = 0;
  const lines = text.split('\n');
  for (const line of lines) {
    if (ENV_LINE_REGEX.test(line)) {
      matches.push({ kind: 'env', match: line, offset: lineStart, length: line.length });
    }
    lineStart += line.length + 1; // +1 for the consumed '\n'
  }

  // 1 & 4. Token-level heuristics
  for (const { token, offset } of tokenize(text)) {
    // 1. prefix
    for (const prefix of SECRET_PREFIXES) {
      if (token.startsWith(prefix) && token.length >= 16) {
        matches.push({ kind: 'prefix', match: token, offset, length: token.length });
        break;
      }
    }
    // 4. high-entropy near sensitive context
    if (token.length >= 20 && shannonEntropy(token) >= 4.0) {
      const winStart = Math.max(0, offset - 40);
      const winEnd = Math.min(text.length, offset + token.length + 40);
      const window = lower.slice(winStart, winEnd);
      if (ENTROPY_CONTEXT_TERMS.some((term) => window.includes(term))) {
        matches.push({ kind: 'entropy', match: token, offset, length: token.length });
      }
    }
  }

  matches.sort((a, b) => a.offset - b.offset);
  return matches;
}
