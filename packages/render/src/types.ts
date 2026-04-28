import type { BatonPacket } from '@baton/schema';

export type RenderTarget = 'generic' | 'claude-code' | 'codex' | 'cursor';

/**
 * Caller-supplied options that tune rendering without modifying the packet.
 * These are merged with (and take precedence over) `packet.render_hints`.
 */
export interface RenderOptions {
  /** Soft cap on the token budget. The renderer truncates context items
   *  when the running estimate exceeds this threshold. */
  contextBudget?: number;
  /** Whether to append a provenance table at the bottom. Default false. */
  includeProvenance?: boolean;
}

export interface RenderWarning {
  code: string;
  message: string;
}

export interface RenderResult {
  /** Full rendered markdown string. */
  markdown: string;
  target: RenderTarget;
  /** Rough token estimate via `roughEstimate` from `@baton/llm`. */
  tokenEstimate: number;
  warnings: RenderWarning[];
  /** True when context items were dropped to stay under `contextBudget`. */
  truncated: boolean;
}

/**
 * Contract every target renderer implements.
 * Implementations must be pure: same packet + options → same markdown.
 */
export interface Renderer {
  readonly target: RenderTarget;
  render(packet: BatonPacket, options?: RenderOptions): RenderResult;
}
