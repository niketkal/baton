import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { ArtifactRef, ArtifactType, CompileMode } from '@batonai/compiler';
import type { LLMCache, LLMProvider } from '@batonai/llm';
import type { Command } from 'commander';

export interface CompileCommandOptions {
  packet: string;
  mode?: CompileMode;
  repo?: string;
  json?: boolean;
  /**
   * Test-only: forward an explicit LLM provider into the pipeline.
   * Bypasses provider auto-detection so unit tests can pin a mock
   * without touching `ANTHROPIC_API_KEY`. Not surfaced as a CLI flag.
   */
  llm?: LLMProvider;
  /**
   * Test-only: forward a pre-constructed cache. `null` disables.
   */
  cache?: LLMCache | null;
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

  // Validate packet id at the CLI boundary so a hostile flag value cannot
  // leak into downstream filesystem joins. See @batonai/store validatePacketId().
  const validatePacketId: (id: unknown) => asserts id is string = (await import('@batonai/store'))
    .validatePacketId;
  try {
    validatePacketId(opts.packet);
  } catch (err) {
    process.stderr.write(`baton: ${(err as Error).message}\n`);
    return 1;
  }

  const { compile, estimateCostUsd } = await import('@batonai/compiler');
  const artifacts = collectArtifacts(repoRoot, opts.packet);
  const compileOpts: Parameters<typeof compile>[0] = {
    packetId: opts.packet,
    repoRoot,
    mode,
    artifacts,
  };
  if (opts.llm !== undefined) compileOpts.llm = opts.llm;
  if (opts.cache !== undefined) compileOpts.cache = opts.cache;
  const result = await compile(compileOpts);

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

  // Cost block (full mode only). Per tech spec §7.5 we print to
  // stderr in human mode so it doesn't pollute piped JSON. In --json
  // mode we skip the human cost block; the structured fields are
  // already in the JSON payload above (and in the log event below).
  const tokensIn = result.tokensIn ?? 0;
  const tokensOut = result.tokensOut ?? 0;
  const provider = result.llmProvider ?? '';
  const model = result.llmModel ?? '';
  let costMin: number | undefined;
  let costMax: number | undefined;
  if (mode === 'full' && opts.json !== true) {
    const totalCalls = result.cacheHits + result.cacheMisses;
    const lines: string[] = [];
    lines.push(`LLM calls: ${totalCalls} (${result.cacheHits} cached, ${result.cacheMisses} live)`);
    lines.push(
      `Tokens: ${tokensIn.toLocaleString('en-US')} input / ${tokensOut.toLocaleString('en-US')} output`,
    );
    const cost = estimateCostUsd(provider, model, tokensIn, tokensOut);
    if (cost) {
      costMin = cost.min;
      costMax = cost.max;
      lines.push(
        `Estimated cost: $${cost.min.toFixed(3)} to $${cost.max.toFixed(3)} (provider: ${provider}, model: ${model})`,
      );
    }
    process.stderr.write(`${lines.join('\n')}\n`);
  } else if (mode === 'full') {
    const cost = estimateCostUsd(provider, model, tokensIn, tokensOut);
    if (cost) {
      costMin = cost.min;
      costMax = cost.max;
    }
  }

  const { getLogger } = await import('../output/logger.js');
  const { redactForLog } = await import('../output/redact.js');
  const { logger } = getLogger(repoRoot);
  const meta: Parameters<typeof redactForLog>[0] = {
    command: 'compile',
    mode,
    exit_code: result.valid ? 0 : 2,
    duration_ms: Date.now() - start,
    packet_id: opts.packet,
    llm_calls_live: result.cacheMisses,
    llm_calls_cached: result.cacheHits,
    tokens_in: tokensIn,
    tokens_out: tokensOut,
    shape: { warnings: result.warnings.length },
  };
  if (provider) (meta as { llm_provider?: string }).llm_provider = provider;
  if (costMin !== undefined)
    (meta as { estimated_cost_usd_min?: number }).estimated_cost_usd_min = costMin;
  if (costMax !== undefined)
    (meta as { estimated_cost_usd_max?: number }).estimated_cost_usd_max = costMax;
  logger.info(redactForLog(meta), 'command complete');
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
