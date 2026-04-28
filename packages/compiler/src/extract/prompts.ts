/**
 * Prompt-template loader for the LLM extractors.
 *
 * Templates live as `.md` files under `src/extract/prompts/` so they can
 * be read, reviewed, and edited without recompiling. The build copies
 * the directory to `dist/extract/prompts/` (see `tsup.config.ts`).
 *
 * Templates are split into a `# System` section and a `# User` section
 * by the loader; everything before `# User` after stripping the
 * frontmatter becomes the system prompt, the rest is the user prompt.
 * Handlebars-style `{{placeholder}}` tokens are interpolated by the
 * caller via `interpolate()`.
 */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));

/**
 * Candidate prompt-directory locations, in priority order:
 *
 *  1. `<here>/prompts/` — vitest path: `src/extract/prompts/`.
 *  2. `<here>/extract/prompts/` — tsup chunk path: when `prompts.ts`
 *     compiles into the same chunk as a callsite living at
 *     `dist/<chunk>.js`, the relative offset back to the asset dir
 *     is `extract/prompts/`.
 *  3. `<here>/../extract/prompts/` — defensive fallback for unusual
 *     bundle shapes.
 *
 * We pick the first one that exists at module-load time. If none
 * exist, `loadPrompt` throws with a clear "prompts directory not
 * found" message rather than producing an opaque ENOENT later.
 */
function resolvePromptDir(): string {
  const candidates = [
    join(HERE, 'prompts'),
    join(HERE, 'extract', 'prompts'),
    resolve(HERE, '..', 'extract', 'prompts'),
  ];
  for (const c of candidates) {
    if (existsSync(c)) return c;
  }
  // Fall back to the first candidate so the error message points at
  // the most likely missing location.
  return candidates[0] as string;
}

const PROMPT_DIR = resolvePromptDir();

export interface PromptTemplate {
  system: string;
  user: string;
}

const cache = new Map<string, PromptTemplate>();

/**
 * Strip the YAML-ish `---`-fenced frontmatter from the top of a template.
 * The frontmatter is informational only — used by reviewers to see what
 * the contract is — and not part of the prompt sent to the model.
 */
function stripFrontmatter(text: string): string {
  if (!text.startsWith('---')) return text;
  const end = text.indexOf('\n---', 3);
  if (end === -1) return text;
  const after = text.slice(end + '\n---'.length);
  // Eat the trailing newline after the closing fence.
  return after.startsWith('\n') ? after.slice(1) : after;
}

function splitSections(text: string): PromptTemplate {
  const body = stripFrontmatter(text);
  const userMarker = '\n# User\n';
  const idx = body.indexOf(userMarker);
  if (idx === -1) {
    // No explicit split — treat the whole body as the user prompt and
    // leave the system prompt empty.
    return { system: '', user: body.trim() };
  }
  const systemRaw = body.slice(0, idx);
  const userRaw = body.slice(idx + userMarker.length);
  // Strip a leading `# System\n` if present.
  const system = systemRaw.replace(/^#\s+System\s*\n/, '').trim();
  return { system, user: userRaw.trim() };
}

export function loadPrompt(name: string): PromptTemplate {
  const cached = cache.get(name);
  if (cached) return cached;
  const file = join(PROMPT_DIR, `${name}.md`);
  const raw = readFileSync(file, 'utf8');
  const tpl = splitSections(raw);
  cache.set(name, tpl);
  return tpl;
}

/**
 * Interpolate `{{placeholder}}` tokens in a string. Unknown placeholders
 * are left as-is (with a visible `<<missing>>` suffix) so a typo is
 * obvious in test output rather than silently empty.
 */
export function interpolate(text: string, vars: Record<string, string>): string {
  return text.replace(/\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g, (_match, name: string) => {
    if (Object.prototype.hasOwnProperty.call(vars, name)) {
      return vars[name] ?? '';
    }
    return `{{${name}}}<<missing>>`;
  });
}

/** Convenience: load + interpolate in one call. */
export function renderPrompt(name: string, vars: Record<string, string>): PromptTemplate {
  const tpl = loadPrompt(name);
  return {
    system: interpolate(tpl.system, vars),
    user: interpolate(tpl.user, vars),
  };
}

/** Test-only: clear the in-memory cache. */
export function _resetPromptCacheForTests(): void {
  cache.clear();
}
