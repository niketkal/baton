import type { BatonPacket } from '@baton/schema';
import { claudeCodeRenderer } from './targets/claude-code.js';
import { genericRenderer } from './targets/generic.js';
import type { RenderOptions, RenderResult, RenderTarget } from './types.js';

const renderers = new Map([
  ['generic', genericRenderer],
  ['claude-code', claudeCodeRenderer],
]);

export function render(
  packet: BatonPacket,
  target: RenderTarget,
  options?: RenderOptions,
): RenderResult {
  const renderer = renderers.get(target);
  if (!renderer) {
    throw new Error(`unknown render target: ${target}`);
  }
  return renderer.render(packet, options);
}

export * from './types.js';
