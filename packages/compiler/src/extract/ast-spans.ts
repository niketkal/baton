/**
 * Helpers for computing byte spans through unified AST nodes. Used by
 * parsers that need to attribute extracted fields back to their source
 * byte ranges, and by the provenance pass to populate
 * `provenance_links[].span_start` / `span_end`.
 *
 * Unified nodes carry a `position` with `start.offset` / `end.offset`
 * when the parser was configured with positional info — but the offsets
 * are optional, so this helper returns `null` if either is missing.
 */

export interface ByteSpan {
  start: number;
  end: number;
}

/**
 * Minimal positional shape we accept. Covers `unist`'s `Node` (and by
 * extension every `mdast` node when remark is asked to keep positional
 * info, which is the default).
 */
export interface NodeWithPosition {
  position?: {
    start?: { offset?: number };
    end?: { offset?: number };
  };
}

/**
 * Returns the byte-offset span for a unified AST node, or `null` if the
 * node has no positional info attached. Callers should treat `null` as
 * "unattributable" — typically by leaving `span_start` / `span_end` as
 * `null` on the resulting provenance link rather than fabricating an
 * incorrect range.
 */
export function computeSpan(node: NodeWithPosition | null | undefined): ByteSpan | null {
  if (node == null) return null;
  const start = node.position?.start?.offset;
  const end = node.position?.end?.offset;
  if (typeof start !== 'number' || typeof end !== 'number') return null;
  if (end < start) return null;
  return { start, end };
}

/**
 * Compute the smallest span that covers every input span. Returns `null`
 * when the input is empty or every entry was `null`. Useful when a
 * synthesized field draws from multiple AST nodes and we want a single
 * conservative range.
 */
export function unionSpans(spans: Array<ByteSpan | null>): ByteSpan | null {
  let start = Number.POSITIVE_INFINITY;
  let end = Number.NEGATIVE_INFINITY;
  let saw = false;
  for (const s of spans) {
    if (s === null) continue;
    saw = true;
    if (s.start < start) start = s.start;
    if (s.end > end) end = s.end;
  }
  if (!saw) return null;
  return { start, end };
}
