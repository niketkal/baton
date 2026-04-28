/**
 * Explicit registry of conformance cases. Per CLAUDE.md (the same
 * one-import-per-rule discipline used by `@baton/lint`'s rule
 * registry): adding a case means adding a `cases/<id>/` directory on
 * disk AND adding one entry below. No glob imports.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve as resolvePath } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ConformanceCase } from '../types.js';

const HERE = dirname(fileURLToPath(import.meta.url));

/**
 * Resolve the on-disk `cases/` directory. We walk up from the
 * compiled location (`dist/cases/index.js`) or the source location
 * (`src/cases/index.ts`) until we find a sibling `cases/` folder.
 *
 * Falling back to a directory probe rather than baking in a relative
 * path keeps the loader robust against layout changes (dist vs src,
 * tsx vs node).
 */
function resolveDefaultCasesDir(): string {
  const candidates = [
    // src layout: packages/conformance/src/cases/index.ts -> ../../cases
    resolvePath(HERE, '..', '..', 'cases'),
    // tsup bundle: packages/conformance/dist/<chunk>.js -> ../cases
    resolvePath(HERE, '..', 'cases'),
    // nested dist: dist/bin/baton-conformance.js -> ../../cases
    resolvePath(HERE, '..', '..', 'cases'),
    // last-resort: walk up an extra level
    resolvePath(HERE, '..', '..', '..', 'cases'),
  ];
  for (const c of candidates) {
    if (existsSync(c)) return c;
  }
  // Last resort — return the first candidate; caller will surface a
  // clear error if it's not present.
  return candidates[0] ?? HERE;
}

/**
 * Explicit case manifest. Each entry maps a case id to its
 * directory name relative to the `cases/` root. Adding a case means
 * appending a line here.
 */
export const CASE_MANIFEST: ReadonlyArray<{ id: string; dir: string }> = [
  { id: 'simple-debugging', dir: 'simple-debugging' },
  { id: 'feature-implementation', dir: 'feature-implementation' },
  { id: 'code-review', dir: 'code-review' },
  { id: 'partial-context', dir: 'partial-context' },
  { id: 'secret-leak', dir: 'secret-leak' },
];

export interface LoadCasesOptions {
  /**
   * Override the cases root directory. Defaults to the package's
   * shipped `cases/` folder.
   */
  casesDir?: string;
}

/**
 * Load every case in `CASE_MANIFEST`, parse its `case.json`, and
 * resolve artifact `uri` values to absolute paths. Throws if any
 * declared case is missing on disk so misconfiguration fails loud.
 */
export function loadCases(opts: LoadCasesOptions = {}): ConformanceCase[] {
  const root = opts.casesDir ?? resolveDefaultCasesDir();
  const cases: ConformanceCase[] = [];
  for (const entry of CASE_MANIFEST) {
    const caseDir = join(root, entry.dir);
    const caseJsonPath = join(caseDir, 'case.json');
    if (!existsSync(caseJsonPath)) {
      throw new Error(`conformance: case.json missing for ${entry.id} at ${caseJsonPath}`);
    }
    const raw = JSON.parse(readFileSync(caseJsonPath, 'utf8')) as ConformanceCase;
    const resolved: ConformanceCase = {
      ...raw,
      input: {
        ...raw.input,
        artifacts: raw.input.artifacts.map((a) => ({
          ...a,
          uri: isAbsolute(a.uri) ? a.uri : resolvePath(caseDir, a.uri),
        })),
      },
    };
    if (resolved.id !== entry.id) {
      throw new Error(
        `conformance: case id mismatch — manifest says ${entry.id}, case.json says ${resolved.id}`,
      );
    }
    cases.push(resolved);
  }
  return cases;
}

/**
 * List every case directory under a `cases/` root. Useful for
 * tooling that needs to verify the manifest matches what's on disk.
 */
export function listCaseDirs(opts: LoadCasesOptions = {}): string[] {
  const root = opts.casesDir ?? resolveDefaultCasesDir();
  if (!existsSync(root)) return [];
  return readdirSync(root)
    .map((name) => ({ name, path: join(root, name) }))
    .filter(({ path }) => existsSync(join(path, 'case.json')))
    .map(({ name }) => name)
    .sort();
}
