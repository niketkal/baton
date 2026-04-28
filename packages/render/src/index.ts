import type { BatonPacket } from '@baton/schema';
import { claudeCodeRenderer } from './targets/claude-code.js';
import { codexRenderer } from './targets/codex.js';
import { cursorRenderer } from './targets/cursor.js';
import { genericRenderer } from './targets/generic.js';
import type { RenderOptions, RenderResult, RenderTarget, Renderer } from './types.js';

// Typing the Map as `Map<RenderTarget, Renderer>` makes TS reject any entry
// whose key is not in the `RenderTarget` union — registry-key typos become
// compile errors instead of runtime "unknown target" exceptions.
const renderers: Map<RenderTarget, Renderer> = new Map<RenderTarget, Renderer>([
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
    const supported = [...renderers.keys()].sort().join(', ');
    throw new Error(`unknown render target: ${target} (supported: ${supported})`);
  }
  return renderer.render(packet, options);
}

export * from './types.js';
