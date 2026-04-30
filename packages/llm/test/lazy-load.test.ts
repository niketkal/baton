/**
 * Verifies the npx cold-start invariant from CLAUDE.md / tech spec §9.2:
 * importing `@batonai/llm` (or any registry-only path) must NOT eagerly pull
 * `@anthropic-ai/sdk`, `openai`, `@anthropic-ai/tokenizer`, or `js-tiktoken`
 * into Node's module cache. They are optional peer deps and add hundreds of
 * milliseconds to startup.
 *
 * Two real assertions:
 *   1. Glob over `src/**` minus the two provider files. After stripping
 *      both `//` and `/* … *​/` comments, no static `import … from` may
 *      reference the SDKs.
 *   2. Build the package (if `dist/` doesn't exist) and grep the bundled
 *      output for `from '<sdk>'` patterns — distinct from dynamic
 *      `import('<sdk>')` calls, which are allowed.
 */

import { execSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const PKG_ROOT = path.resolve(__dirname, '..');
const SDK_NAMES = [
  '@anthropic-ai/sdk',
  'openai',
  '@anthropic-ai/tokenizer',
  'js-tiktoken',
] as const;

function walkDir(root: string, predicate: (abs: string) => boolean): string[] {
  const out: string[] = [];
  function recurse(dir: string): void {
    let names: string[] = [];
    try {
      names = readdirSync(dir);
    } catch {
      return;
    }
    for (const name of names) {
      const abs = path.join(dir, name);
      let st: ReturnType<typeof statSync>;
      try {
        st = statSync(abs);
      } catch {
        continue;
      }
      if (st.isDirectory()) {
        if (name === 'node_modules' || name === 'dist') continue;
        recurse(abs);
      } else if (predicate(abs)) {
        out.push(abs);
      }
    }
  }
  recurse(root);
  return out;
}

/** Strip `//` line comments and `/* … *​/` block comments from TS source. */
function stripComments(src: string): string {
  // Remove block comments first (non-greedy, multi-line).
  const noBlock = src.replace(/\/\*[\s\S]*?\*\//g, '');
  // Then strip line comments. Naive but adequate for our codebase: we
  // don't put `//` inside string literals in this package.
  return noBlock
    .split('\n')
    .map((line) => {
      const idx = line.indexOf('//');
      return idx === -1 ? line : line.slice(0, idx);
    })
    .join('\n');
}

describe('lazy-loading discipline', () => {
  it('no source file outside the two provider modules statically imports an SDK', () => {
    const srcRoot = path.join(PKG_ROOT, 'src');
    const allTs = walkDir(srcRoot, (p) => p.endsWith('.ts'));
    const excluded = new Set([
      path.join(srcRoot, 'providers', 'anthropic.ts'),
      path.join(srcRoot, 'providers', 'openai.ts'),
    ]);
    const candidates = allTs.filter((p) => !excluded.has(p));
    expect(candidates.length).toBeGreaterThan(0);
    for (const file of candidates) {
      const stripped = stripComments(readFileSync(file, 'utf8'));
      for (const sdk of SDK_NAMES) {
        const pattern = new RegExp(
          `import\\s[^;]*from\\s+['"]${sdk.replace(/[/\\.]/g, '\\$&')}['"]`,
        );
        expect(
          stripped,
          `${path.relative(PKG_ROOT, file)} must not statically import "${sdk}"`,
        ).not.toMatch(pattern);
      }
    }
  });

  it('the built bundle does not statically import an SDK', () => {
    const distRoot = path.join(PKG_ROOT, 'dist');
    if (!existsSync(distRoot)) {
      // Build on demand. Slow path — usually CI runs build before test.
      execSync('pnpm --filter @batonai/llm build', {
        cwd: path.resolve(PKG_ROOT, '..', '..'),
        stdio: 'inherit',
      });
    }
    const allDist = walkDir(distRoot, (p) => /\.(?:m?js|cjs|d\.ts)$/.test(p));
    expect(allDist.length).toBeGreaterThan(0);
    for (const file of allDist) {
      const src = readFileSync(file, 'utf8');
      for (const sdk of SDK_NAMES) {
        // We only flag `from '<sdk>'` substrings — dynamic `import('<sdk>')`
        // calls keep the SDK name as a string-literal argument, which is
        // allowed.
        const pattern = new RegExp(`from\\s*['"]${sdk.replace(/[/\\.]/g, '\\$&')}['"]`);
        expect(
          src,
          `${path.relative(PKG_ROOT, file)} must not statically reference "${sdk}"`,
        ).not.toMatch(pattern);
      }
    }
  });
});
