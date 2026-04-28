import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse as parseToml } from 'smol-toml';

export interface BatonConfig {
  llm: {
    provider?: string;
    model?: string;
  };
}

const DEFAULT_CONFIG: BatonConfig = {
  llm: {},
};

/**
 * Load `.baton/config.toml` from the given repo root. Missing file is
 * not an error — defaults are returned. Malformed TOML throws so the
 * user notices early.
 */
export function loadConfig(repoRoot: string): BatonConfig {
  const path = join(repoRoot, '.baton', 'config.toml');
  let raw: string;
  try {
    raw = readFileSync(path, 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return { ...DEFAULT_CONFIG, llm: { ...DEFAULT_CONFIG.llm } };
    }
    throw err;
  }
  const parsed = parseToml(raw) as Record<string, unknown>;
  const llmSection = (parsed.llm ?? {}) as Record<string, unknown>;
  return {
    llm: {
      ...(typeof llmSection.provider === 'string' ? { provider: llmSection.provider } : {}),
      ...(typeof llmSection.model === 'string' ? { model: llmSection.model } : {}),
    },
  };
}
