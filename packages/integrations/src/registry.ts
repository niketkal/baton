/**
 * Explicit integration registry. One import per integration — no glob
 * imports, mirroring the lint-rule registry trade-off documented in
 * CLAUDE.md.
 *
 * Adding an integration = create the folder under `src/<id>/` and add a
 * `register(...)` line below.
 */

import { claudeCodeIntegration } from './claude-code/index.js';
import { codexIntegration } from './codex/index.js';
import { cursorIntegration } from './cursor/index.js';
import type { Integration } from './types.js';

const REGISTRY = new Map<string, Integration>();

export function register(integration: Integration): void {
  REGISTRY.set(integration.id, integration);
}

export function get(id: string): Integration | undefined {
  return REGISTRY.get(id);
}

export function list(): readonly Integration[] {
  return [...REGISTRY.values()];
}

// Pre-registration. github-ci is v1.5.
register(claudeCodeIntegration);
register(codexIntegration);
register(cursorIntegration);
