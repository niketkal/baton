/**
 * Limit-marker patterns for the Codex CLI wrapper.
 *
 * Codex CLI does not expose a hook surface (tech spec §8.2). Our
 * wrapper-launcher mode watches Codex's stdout and triggers a Baton
 * handoff when one of these patterns matches a chunk.
 *
 * Be conservative: false positives prepare an unnecessary handoff +
 * notify the user; false negatives just miss an automatic handoff.
 * The user can always run `baton compile && baton render` by hand.
 *
 * Each pattern documents the source string it was seeded from so it's
 * obvious where the heuristic came from when we tune the list later.
 */

export interface LimitMarker {
  pattern: RegExp;
  /** Where the source string came from. Comment-only; for humans. */
  source: string;
}

export const LIMIT_MARKERS: readonly LimitMarker[] = [
  // OpenAI / Codex rate-limit messaging shape: "Rate limit reached for ..."
  { pattern: /rate.?limit/i, source: 'openai rate limit error' },
  // Codex CLI usage caps: "You have hit your usage limit."
  { pattern: /usage limit/i, source: 'codex cli usage cap message' },
  // Generic context-window exhaustion: "context window exceeded",
  // "context limit reached".
  {
    pattern: /context.?(window|limit) (exceeded|reached)/i,
    source: 'codex / openai context exhaustion',
  },
  // Backoff message that typically wraps a 429-class failure.
  { pattern: /please try again later/i, source: 'codex backoff hint' },
];

/**
 * Returns true if the buffer contains at least one limit marker. Caller is
 * responsible for de-duping repeated hits (we only want to fire one handoff
 * per Codex session even if the marker repeats).
 */
export function hasLimitMarker(s: string): boolean {
  for (const m of LIMIT_MARKERS) {
    if (m.pattern.test(s)) return true;
  }
  return false;
}
