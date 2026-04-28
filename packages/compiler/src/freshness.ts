import type { RepoContext } from './repo.js';
import type { Packet } from './types.js';

// TODO(Session 13): real implementation will diff context_items against the
// repo HEAD and per-file mtimes to compute a per-item and per-packet
// freshness score. For now we return "fresh" so downstream policy code
// has a stable shape to consume.

export interface FreshnessResult {
  stale: boolean;
  score: number;
}

export function assessFreshness(_packet: Packet, _ctx: RepoContext): FreshnessResult {
  return { stale: false, score: 1.0 };
}
