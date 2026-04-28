import type { NormalizedInput } from '../modes.js';

// TODO(Session 11): real LLM-driven field extraction. The pipeline only
// reaches this code path in `--full` mode, which Session 6 does not
// exercise. Calling `runExtractors` from any path today is a programming
// error.

export interface ExtractedFields {
  objective?: string;
  current_state?: string;
  next_action?: string;
}

export function runExtractors(_input: NormalizedInput, _llm: unknown): ExtractedFields {
  throw new Error('LLM extraction not implemented until Session 11');
}
