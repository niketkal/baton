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
export {
  computeSpan,
  unionSpans,
  type ByteSpan,
  type NodeWithPosition,
} from './extract/ast-spans.js';
