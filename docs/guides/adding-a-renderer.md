# Adding a render target

A new render target is one source file and one set of snapshot fixtures.

## 1. Create the renderer file

Each target lives at `packages/render/src/targets/<name>.ts`:

```ts
// packages/render/src/targets/aider.ts
import type { Renderer, RenderResult } from '../types.js';
import { renderHeader, renderConstraints, estimateTokens } from '../templates/index.js';

export const aiderRenderer: Renderer = {
  target: 'aider',
  render(packet, hints) {
    const sections: string[] = [];
    sections.push(renderHeader(packet, { tone: 'concise' }));
    sections.push(`## Objective\n${packet.objective}`);
    sections.push(`## Files\n${packet.context_items
      .filter(i => i.kind === 'file')
      .map(i => `- ${i.ref}`)
      .join('\n')}`);
    sections.push(renderConstraints(packet.constraints));
    sections.push(`## Next action\n${packet.next_action}`);

    const text = sections.join('\n\n');
    return {
      text,
      tokenEstimate: estimateTokens(text),
      warnings: [],
    };
  },
};
```

Renderers must be **pure functions** of `(packet, hints)`. No filesystem
access, no clock reads, no random output. Same input → same output.

## 2. Use shared template helpers

`packages/render/src/templates/` exports helpers for the recurring
sections (header, constraints, acceptance criteria, provenance footer,
token estimate). Use them rather than duplicating Markdown.

If a target needs a section style not yet in `templates/`, add the helper
there in the same PR so the next renderer can reuse it.

## 3. Add the target to the type

Edit `packages/render/src/types.ts`:

```ts
export type RenderTarget = 'claude-code' | 'codex' | 'cursor' | 'aider' | 'generic';
```

…and the registry:

```ts
import { aiderRenderer } from './targets/aider.js';

export const allRenderers = [
  claudeCodeRenderer,
  codexRenderer,
  cursorRenderer,
  aiderRenderer,    // new
  genericRenderer,
];
```

## 4. Snapshot tests

Create `packages/render/test/snapshots/aider/` with one `.md` per
canonical packet shape. The test loader in
`packages/render/test/render.test.ts` runs each fixture through the
renderer and compares against the snapshot.

Recommended snapshots, at minimum:

- `debugging-task.md` — full packet with attempts, constraints,
  acceptance criteria, provenance
- `partial-packet.md` — packet with warnings and missing fields
- `tiny-packet.md` — minimum-required-fields packet

When you intentionally change output, update the snapshot in the same
PR with a sentence in the commit message about why.

## 5. Wire CLI flag

`baton render --target aider` and `baton failover --to aider` pick up
the new target automatically through the registry. No CLI code change
needed.

## 6. Document

- Add the target to the `Targets` list in `docs/spec/cli-contract.md`.
- Add the target to the `Per-package responsibilities` section of
  `docs/architecture.md` if it introduces a new section style.

## 7. Tests

```bash
pnpm --filter @baton/render test
```

The renderer must:

- not crash on any of the conformance reference packets in
  `packages/conformance/cases/`
- stay under the `baton render` performance budget (< 100ms on the
  reference packet shape)
- produce deterministic output (run the snapshot test twice; both runs
  must match)

## 8. PR

```
feat(render): add aider target
```

A new render target does not require an ADR unless it introduces a new
section format or breaks the renderer interface.
