import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { ArtifactRef, ArtifactType, CompileMode } from '@baton/compiler';
import type { Command } from 'commander';

export interface CompileCommandOptions {
  packet: string;
  mode?: CompileMode;
  repo?: string;
  json?: boolean;
}

interface ArtifactMeta {
  id: string;
  kind: ArtifactType;
  file: string;
}

/**
 * Walk `.baton/artifacts/<id>/` and assemble an `ArtifactRef[]` for
 * the compiler. We trust the metadata.json sidecar written by `ingest`.
 *
 * Filtering by packet id: artifacts whose metadata.json names a
 * different packet are skipped. Artifacts with no packet id (the
 * default in v1) are included for every compile.
 */
export function collectArtifacts(repoRoot: string, packetId: string): ArtifactRef[] {
  const root = join(repoRoot, '.baton', 'artifacts');
  let entries: string[];
  try {
    entries = readdirSync(root);
  } catch {
    return [];
  }
  const refs: ArtifactRef[] = [];
  for (const id of entries) {
    const dir = join(root, id);
    let st: ReturnType<typeof statSync>;
    try {
      st = statSync(dir);
    } catch {
      continue;
    }
    if (!st.isDirectory()) continue;
    const metaPath = join(dir, 'metadata.json');
    let meta: ArtifactMeta & { packet?: string | null };
    try {
      meta = JSON.parse(readFileSync(metaPath, 'utf8')) as ArtifactMeta & {
        packet?: string | null;
      };
    } catch {
      continue;
    }
    if (meta.packet && meta.packet !== packetId) continue;
    refs.push({ type: meta.kind, uri: join(dir, meta.file) });
  }
  return refs;
}

export async function runCompile(opts: CompileCommandOptions): Promise<number> {
  const start = Date.now();
  const repoRoot = opts.repo ?? process.cwd();
  const mode: CompileMode = opts.mode ?? 'fast';

  if (mode === 'full') {
    process.stderr.write('compile --full is not implemented until Session 11\n');
    return 1;
  }

  const { compile } = await import('@baton/compiler');
  const artifacts = collectArtifacts(repoRoot, opts.packet);
  const result = await compile({
    packetId: opts.packet,
    repoRoot,
    mode,
    artifacts,
  });

  const { renderHumanResult, renderHumanWarnings } = await import('../output/human.js');
  const { renderJsonResult } = await import('../output/json.js');
  if (opts.json === true) {
    process.stdout.write(
      renderJsonResult({
        packet: result.packet,
        warnings: result.warnings,
        valid: result.valid,
        durationMs: result.durationMs,
      }),
    );
  } else {
    process.stdout.write(
      renderHumanResult({
        ok: result.valid,
        title: `compiled packet ${result.packet.id}`,
        summary: `${result.warnings.length} warning(s) · ${result.durationMs}ms`,
      }),
    );
    // Fix 3: surface each warning's code+message to stderr so humans
    // get something actionable. JSON mode already includes the
    // structured array.
    if (result.warnings.length > 0) {
      process.stderr.write(
        renderHumanWarnings(
          result.warnings.map((w) => ({
            code: w.code,
            message: w.message,
            path: w.path,
          })),
        ),
      );
    }
  }

  const { getLogger } = await import('../output/logger.js');
  const { redactForLog } = await import('../output/redact.js');
  const { logger } = getLogger(repoRoot);
  logger.info(
    redactForLog({
      command: 'compile',
      mode,
      exit_code: result.valid ? 0 : 2,
      duration_ms: Date.now() - start,
      packet_id: opts.packet,
      llm_calls_live: 0,
      llm_calls_cached: result.cacheHits,
      shape: { warnings: result.warnings.length },
    }),
    'command complete',
  );
  return result.valid ? 0 : 2;
}

export function registerCompile(program: Command): void {
  program
    .command('compile')
    .description('Compile or refresh a packet from current artifacts')
    .requiredOption('--packet <id>', 'packet id')
    .option('--mode <fast|full>', 'compile mode', 'fast')
    .option('--full', 'shorthand for --mode full', false)
    .option('--repo <path>', 'repo root', process.cwd())
    .option('--json', 'machine-readable output', false)
    .action(
      async (raw: {
        packet: string;
        mode?: string;
        full?: boolean;
        repo?: string;
        json?: boolean;
      }) => {
        const mode: CompileMode =
          raw.full === true ? 'full' : raw.mode === 'full' ? 'full' : 'fast';
        const code = await runCompile({
          packet: raw.packet,
          mode,
          ...(raw.repo !== undefined ? { repo: raw.repo } : {}),
          ...(raw.json !== undefined ? { json: raw.json } : {}),
        });
        process.exitCode = code;
      },
    );
}
