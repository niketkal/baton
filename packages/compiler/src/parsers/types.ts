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
}

export interface ParsedTranscript {
  tool: string;
  messages: TranscriptMessage[];
  rawLength: number;
  /**
   * `true` when the file did not look like a recognized transcript
   * format and the parser fell back to wrapping the entire file as one
   * assistant message. Callers surface this as a `CompileWarning`.
   */
  unrecognized: boolean;
}
