import type { BatonPacket } from '@baton/schema';
import { claudeCodeRenderer } from './targets/claude-code.js';
import { codexRenderer } from './targets/codex.js';
import { cursorRenderer } from './targets/cursor.js';
import { genericRenderer } from './targets/generic.js';
import type { RenderOptions, RenderResult, RenderTarget } from './types.js';

const renderers = new Map([
  ['generic', genericRenderer],
  ['claude-code', claudeCodeRenderer],
  ['codex', codexRenderer],
  ['cursor', cursorRenderer],
]);

export function render(
  packet: BatonPacket,
  target: RenderTarget,
  options?: RenderOptions,
): RenderResult {
  const renderer = renderers.get(target);
  if (!renderer) {
    const supported = [...renderers.keys()].join(', ');
    throw new Error(`unknown render target: ${target} (supported: ${supported})`);
  }
  return renderer.render(packet, options);
}

export * from './types.js';
