export interface ParserOpts {
  signal?: AbortSignal;
  repoRoot?: string;
}

export interface Parser<T> {
  type: string;
  parse(uri: string, opts?: ParserOpts): Promise<T>;
}

export type TranscriptRole = 'user' | 'assistant' | 'system' | 'tool';

export interface TranscriptMessage {
  role: TranscriptRole;
  text: string;
  ts?: string;
  /**
   * Byte offset (inclusive) into the raw transcript file where this
   * message body begins. Computed by the parser; used by the provenance
   * pass to populate `provenance_links[].span_start`. Optional because
   * not every transcript format yields reliable positional info.
   */
  span_start?: number;
  /**
   * Byte offset (exclusive) into the raw transcript file where this
   * message body ends. See `span_start`.
   */
  span_end?: number;
}

export interface ParsedTranscript {
  tool: string;
  messages: TranscriptMessage[];
  rawLength: number;
  /**
   * The original raw file content. Retained so downstream provenance
   * passes can quote excerpts and the read-only round-trip code can
   * compare byte offsets against the source. The compiler never
   * persists this verbatim into the packet; it lives only on the
   * in-memory normalized input.
   */
  rawText?: string;
  /**
   * `true` when the file did not look like a recognized transcript
   * format and the parser fell back to wrapping the entire file as one
   * assistant message. Callers surface this as a `CompileWarning`.
   */
  unrecognized: boolean;
}
