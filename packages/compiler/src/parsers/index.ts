// Explicit one-import-per-parser registry per CLAUDE.md (no glob imports).
// Adding a parser = create the file under this folder and add a line below.
import type { ArtifactType } from '../types.js';
import { transcriptParser } from './transcript.js';
import type { Parser } from './types.js';

// Only `transcript` is implemented in Session 6. Other artifact types are
// `undefined` here and the pipeline surfaces a CompileWarning when it
// encounters one.
export const PARSERS: Partial<Record<ArtifactType, Parser<unknown>>> = {
  transcript: transcriptParser as Parser<unknown>,
};

export { transcriptParser, parseClaudeCodeTranscript } from './transcript.js';
export type {
  ParsedTranscript,
  Parser,
  ParserOpts,
  TranscriptMessage,
  TranscriptRole,
} from './types.js';
