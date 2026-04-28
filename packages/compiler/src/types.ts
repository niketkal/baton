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
}

export interface CompileWarning {
  code: string;
  message: string;
  severity: 'info' | 'warning' | 'error';
}

export interface CompileResult {
  packet: Packet;
  warnings: CompileWarning[];
  usedLLM: boolean;
  cacheHits: number;
  cacheMisses: number;
  durationMs: number;
}
