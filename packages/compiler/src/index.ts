export { compile } from './pipeline.js';
export type {
  ArtifactRef,
  ArtifactType,
  CompileMode,
  CompileOptions,
  CompileResult,
  CompileWarning,
  Packet,
} from './types.js';
export {
  parseClaudeCodeTranscript,
  transcriptParser,
  type ParsedTranscript,
  type TranscriptMessage,
  type TranscriptRole,
} from './parsers/index.js';
export { attachProvenanceLinks } from './provenance.js';
export { attachRepo, type AttachRepoOptions, type RepoContext } from './repo.js';
export { assessFreshness, type FreshnessAssessment } from './freshness.js';
export {
  computeSpan,
  unionSpans,
  type ByteSpan,
  type NodeWithPosition,
} from './extract/ast-spans.js';
export {
  estimateCostUsd,
  findPricing,
  PRICING_TABLE,
  type CostEstimate,
  type ModelPricing,
} from './extract/pricing.js';
