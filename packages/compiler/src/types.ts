import type { BatonPacket } from '@baton/schema';

/**
 * The packet shape this package compiles into. Re-exported from
 * `@baton/schema` so consumers can import a `Packet` alias from the
 * compiler without reaching into the schema package.
 */
export type Packet = BatonPacket;

/**
 * Supported source artifact types. Mirrors the canonical schema enum
 * `artifactType`, plus an optional `sourceTool` hint that lets parsers
 * specialize when a generic type covers multiple producer formats.
 */
export type ArtifactType =
  | 'transcript'
  | 'log'
  | 'diff'
  | 'issue'
  | 'note'
  | 'image'
  | 'test-report';

export interface ArtifactRef {
  type: ArtifactType;
  uri: string;
  sourceTool?: string;
}

/**
 * `'fast'` runs the deterministic pipeline without any LLM call. This is
 * the mode `baton failover` uses (CLAUDE.md invariant 2). `'full'` will
 * route through the LLM extractors in Session 11.
 */
export type CompileMode = 'fast' | 'full';

export interface CompileOptions {
  packetId: string;
  repoRoot: string;
  mode: CompileMode;
  artifacts: ArtifactRef[];
  signal?: AbortSignal;
  /**
   * Where to open the packet store. Defaults to `path.join(repoRoot,
   * '.baton')`. The literal value `false` is a sentinel meaning "do not
   * persist this compile" — useful for tests and dry-run paths.
   */
  storeRoot?: string | false;
  /**
   * Optional explicit LLM provider for `--full` mode. If omitted, the
   * pipeline calls `getProvider()` from `@baton/llm` with no config
   * (the registry honours `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` in
   * priority order). Tests pass an explicit `MockProvider` so they
   * never hit the network.
   */
  llm?: import('@baton/llm').LLMProvider;
  /**
   * Optional content-addressable LLM cache. Defaults to
   * `path.join(repoRoot, '.baton', 'llm-cache')` in `--full` mode.
   * Pass `null` to disable caching for this run; pass a constructed
   * `LLMCache` to use a custom root or size budget.
   */
  cache?: import('@baton/llm').LLMCache | null;
}

export interface CompileWarning {
  code: string;
  message: string;
  severity: 'info' | 'warning' | 'error';
  /**
   * Optional structured fields for parity with `@baton/lint`'s
   * `LintFinding`. Lets a future `baton compile --json` surface
   * compiler warnings in the same shape as lint findings.
   */
  path?: string;
  data?: Record<string, unknown>;
}

export interface CompileResult {
  packet: Packet;
  warnings: CompileWarning[];
  /**
   * `true` iff the validate step produced zero schema errors. Renderers
   * and dispatchers should refuse to consume a result with `valid: false`
   * rather than scanning `warnings` for `code === 'SCHEMA_INVALID'`.
   */
  valid: boolean;
  /**
   * `true` iff at least one extractor made a live (non-cached) LLM
   * call this run. Cache-only `--full` runs report `false` per
   * tech-spec §7.4.
   */
  usedLLM: boolean;
  cacheHits: number;
  cacheMisses: number;
  durationMs: number;
  /** Total input tokens across all extractor calls this run. */
  tokensIn?: number;
  /** Total output tokens across all extractor calls this run. */
  tokensOut?: number;
  /** Provider name used (e.g., `"anthropic"`). Empty for fast mode. */
  llmProvider?: string;
  /** Model name used (e.g., `"claude-sonnet-4-5"`). Empty for fast mode. */
  llmModel?: string;
}
