import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, isAbsolute, join, resolve as resolvePath } from 'node:path';
import type { ConformanceCase, ConformanceReport, ConformanceResult, Packet } from './types.js';

export interface RunConformanceOptions {
  cases: ConformanceCase[];
  /**
   * Path to the CLI binary entrypoint (a `.js` file). The runner
   * invokes it via `process.execPath` (the running Node) so it works
   * cross-platform without depending on the file's executable bit.
   */
  binPath: string;
  signal?: AbortSignal;
}

interface SpawnResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

function runNode(
  binPath: string,
  args: string[],
  cwd: string,
  signal?: AbortSignal,
): Promise<SpawnResult> {
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn(process.execPath, [binPath, ...args], {
      cwd,
      env: { ...process.env, NO_COLOR: '1' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (b: Buffer) => {
      stdout += b.toString('utf8');
    });
    child.stderr.on('data', (b: Buffer) => {
      stderr += b.toString('utf8');
    });
    const onAbort = (): void => {
      child.kill('SIGTERM');
    };
    if (signal !== undefined) {
      if (signal.aborted) {
        child.kill('SIGTERM');
      } else {
        signal.addEventListener('abort', onAbort, { once: true });
      }
    }
    child.on('error', (err) => {
      if (signal !== undefined) signal.removeEventListener('abort', onAbort);
      rejectRun(err);
    });
    child.on('close', (code) => {
      if (signal !== undefined) signal.removeEventListener('abort', onAbort);
      resolveRun({ exitCode: code ?? 0, stdout, stderr });
    });
  });
}

/**
 * Compare a partial expected packet shape against the actual packet.
 * Recursive deep-equal but only on the keys present in `expected`.
 * Arrays compare by length+each-element. Returns a list of
 * dotted-path failures (empty = match).
 */
export function comparePartialPacket(actual: unknown, expected: unknown, path = ''): string[] {
  if (expected === undefined) return [];
  if (expected === null) {
    return actual === null ? [] : [`${path}: expected null, got ${JSON.stringify(actual)}`];
  }
  if (Array.isArray(expected)) {
    if (!Array.isArray(actual)) {
      return [`${path}: expected array, got ${typeof actual}`];
    }
    if (actual.length < expected.length) {
      return [`${path}: expected at least ${expected.length} items, got ${actual.length}`];
    }
    const failures: string[] = [];
    for (let i = 0; i < expected.length; i++) {
      failures.push(...comparePartialPacket(actual[i], expected[i], `${path}[${i}]`));
    }
    return failures;
  }
  if (typeof expected === 'object') {
    if (typeof actual !== 'object' || actual === null) {
      return [`${path}: expected object, got ${actual === null ? 'null' : typeof actual}`];
    }
    const failures: string[] = [];
    for (const key of Object.keys(expected as Record<string, unknown>)) {
      const next = path === '' ? key : `${path}.${key}`;
      failures.push(
        ...comparePartialPacket(
          (actual as Record<string, unknown>)[key],
          (expected as Record<string, unknown>)[key],
          next,
        ),
      );
    }
    return failures;
  }
  if (actual !== expected) {
    return [`${path}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`];
  }
  return [];
}

interface CompileStdoutShape {
  packet?: Packet;
  warnings?: Array<{ code: string; message: string }>;
  valid?: boolean;
}

interface LintStdoutShape {
  status?: string;
  errors?: Array<{ code: string }>;
  warnings?: Array<{ code: string }>;
}

function tryParseJson<T>(stdout: string): T | undefined {
  const trimmed = stdout.trim();
  if (trimmed === '') return undefined;
  // CLI may emit a single JSON document or jsonl logs; take the first
  // top-level JSON object/array.
  try {
    return JSON.parse(trimmed) as T;
  } catch {
    // Look for first '{' and try to parse to balanced end.
    const start = trimmed.indexOf('{');
    if (start === -1) return undefined;
    let depth = 0;
    for (let i = start; i < trimmed.length; i++) {
      const c = trimmed[i];
      if (c === '{') depth++;
      else if (c === '}') {
        depth--;
        if (depth === 0) {
          try {
            return JSON.parse(trimmed.slice(start, i + 1)) as T;
          } catch {
            return undefined;
          }
        }
      }
    }
    return undefined;
  }
}

async function runOneCase(
  testCase: ConformanceCase,
  binPath: string,
  signal?: AbortSignal,
): Promise<ConformanceResult> {
  const start = Date.now();
  const failures: string[] = [];
  const tmpRoot = join(
    tmpdir(),
    `baton-conformance-${testCase.id}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  );
  mkdirSync(join(tmpRoot, '.baton'), { recursive: true });

  try {
    // Step 1+2: ingest artifacts. We rely on `baton ingest` to lay
    // them out under .baton/artifacts/<uuid>/.
    for (const art of testCase.input.artifacts) {
      const sourcePath = isAbsolute(art.uri) ? art.uri : resolvePath(tmpRoot, art.uri);
      if (!existsSync(sourcePath)) {
        failures.push(`artifact missing on disk: ${art.uri}`);
        continue;
      }
      const ingest = await runNode(
        binPath,
        ['ingest', art.type, sourcePath, '--repo', tmpRoot, '--packet', testCase.id, '--json'],
        tmpRoot,
        signal,
      );
      if (ingest.exitCode !== 0) {
        failures.push(
          `ingest ${art.type} ${basename(sourcePath)} exited ${ingest.exitCode}: ${ingest.stderr.trim().slice(0, 200)}`,
        );
      }
    }

    if (failures.length > 0) {
      return {
        caseId: testCase.id,
        passed: false,
        failures,
        durationMs: Date.now() - start,
      };
    }

    // Step 3: compile.
    const compile = await runNode(
      binPath,
      ['compile', '--packet', testCase.id, '--mode', 'fast', '--repo', tmpRoot, '--json'],
      tmpRoot,
      signal,
    );
    if (compile.exitCode !== 0 && compile.exitCode !== 2) {
      failures.push(`compile exited ${compile.exitCode}: ${compile.stderr.trim().slice(0, 300)}`);
    }
    const compileJson = tryParseJson<CompileStdoutShape>(compile.stdout);
    let actualPacket: Packet | undefined = compileJson?.packet;

    // Step 4: read packet.json from the store as fallback.
    if (actualPacket === undefined) {
      const packetPath = join(tmpRoot, '.baton', 'packets', testCase.id, 'packet.json');
      if (existsSync(packetPath)) {
        try {
          actualPacket = JSON.parse(readFileSync(packetPath, 'utf8')) as Packet;
        } catch (err) {
          failures.push(
            `packet.json unreadable: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      } else {
        failures.push(`packet.json not found at ${packetPath}`);
      }
    }

    // Step 5: compare partial packet shape.
    if (actualPacket !== undefined) {
      const shapeFailures = comparePartialPacket(actualPacket, testCase.expected.packetShape);
      failures.push(...shapeFailures.map((f) => `packetShape: ${f}`));
    }

    // Step 6: lint.
    const lint = await runNode(
      binPath,
      ['lint', '--packet', testCase.id, '--strict', '--repo', tmpRoot, '--json'],
      tmpRoot,
      signal,
    );
    const lintJson = tryParseJson<LintStdoutShape>(lint.stdout);
    const actualPassed = lint.exitCode === 0;
    if (actualPassed !== testCase.expected.lintResult.passed) {
      failures.push(
        `lint: expected passed=${testCase.expected.lintResult.passed}, got passed=${actualPassed} (exit=${lint.exitCode})`,
      );
    }
    if (testCase.expected.lintResult.codes !== undefined && lintJson !== undefined) {
      const allCodes = new Set<string>();
      for (const e of lintJson.errors ?? []) allCodes.add(e.code);
      for (const w of lintJson.warnings ?? []) allCodes.add(w.code);
      for (const expectedCode of testCase.expected.lintResult.codes) {
        if (!allCodes.has(expectedCode)) {
          failures.push(`lint: expected finding code ${expectedCode}, not present`);
        }
      }
    }
  } catch (err) {
    failures.push(`runner exception: ${err instanceof Error ? err.message : String(err)}`);
  } finally {
    try {
      rmSync(tmpRoot, { recursive: true, force: true });
    } catch {
      // best-effort cleanup
    }
  }

  return {
    caseId: testCase.id,
    passed: failures.length === 0,
    failures,
    durationMs: Date.now() - start,
  };
}

export async function runConformance(opts: RunConformanceOptions): Promise<ConformanceReport> {
  const results: ConformanceResult[] = [];
  // Resolve bin to absolute up front: child processes run with cwd
  // pointed at a temp dir, so any relative path from the caller's
  // cwd would otherwise be reinterpreted relative to that temp dir.
  const absBin = isAbsolute(opts.binPath) ? opts.binPath : resolvePath(opts.binPath);
  for (const c of opts.cases) {
    if (opts.signal?.aborted === true) break;
    const r = await runOneCase(c, absBin, opts.signal);
    results.push(r);
  }
  let passed = 0;
  let failed = 0;
  for (const r of results) {
    if (r.passed) passed++;
    else failed++;
  }
  return {
    passed,
    failed,
    total: results.length,
    results,
    cli: { binPath: absBin },
  };
}
