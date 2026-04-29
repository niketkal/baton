import { cpSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { defineConfig } from 'tsup';

/**
 * Build config for `@baton/compiler`.
 *
 * The single non-default piece is the `onSuccess` step that copies
 * `src/extract/prompts/` to `dist/extract/prompts/`. The extractor
 * loader (`src/extract/prompts.ts`) reads `.md` templates at runtime
 * via `import.meta.url`, and tsup does not bundle non-`.ts` assets.
 *
 * Tests don't go through this build — they read the templates directly
 * from `src/extract/prompts/` because vitest resolves `import.meta.url`
 * back to the source file. The two paths converge: `dist/extract/
 * prompts/foo.md` for shipped builds, `src/extract/prompts/foo.md` for
 * vitest.
 */
export default defineConfig({
  entry: ['src/index.ts'],
  format: 'esm',
  dts: true,
  clean: true,
  onSuccess: async () => {
    const srcDir = join('src', 'extract', 'prompts');
    const destDir = join('dist', 'extract', 'prompts');
    mkdirSync(dirname(destDir), { recursive: true });
    cpSync(srcDir, destDir, { recursive: true });
  },
});
