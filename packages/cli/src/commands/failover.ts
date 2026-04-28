import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, resolve } from 'node:path';
import type { RenderTarget } from '@baton/render';
import type { Command } from 'commander';

const RENDER_TARGETS: RenderTarget[] = ['generic', 'claude-code', 'codex', 'cursor'];

export interface FailoverOptions {
  from?: string;
  to?: string;
  packet?: string;
  copy?: boolean;
  out?: string;
  full?: boolean;
  repo?: string;
}

function mapToolToTarget(tool: string | undefined): RenderTarget {
  if (tool === undefined) return 'generic';
  const t = tool.toLowerCase();
  if (RENDER_TARGETS.includes(t as RenderTarget)) return t as RenderTarget;
  return 'generic';
}

/**
 * `baton failover` — first-class macro per CLI contract §8.2.1.
 *
 * Sequence (CLAUDE.md invariant 2: must NOT call live LLM in --fast mode):
 *   1. Validate target (fail before compile if unknown)
 *   2. Gather artifacts under .baton/artifacts/
 *   3. compile (--fast unless --full)
 *   4. Non-strict lint (don't block on warnings; errors stop us)
 *   5. Render target-specific markdown
 *   6. Deliver per output flag (stdout | clipboard | file)
 *   7. Persist (compile() already wrote to .baton/packets/)
 *   8. Emit structured per-command event to local log
 */
export async function runFailover(opts: FailoverOptions): Promise<number> {
  const start = Date.now();
  const repoRoot = opts.repo ?? process.cwd();
  const packetId = opts.packet ?? 'current-task';

  if (opts.to !== undefined && !RENDER_TARGETS.includes(opts.to.toLowerCase() as RenderTarget)) {
    process.stderr.write(
      `unknown target tool: ${opts.to}. Supported: ${RENDER_TARGETS.join(', ')}\n`,
    );
    return 1;
  }
  const target = mapToolToTarget(opts.to);

  const mode = opts.full === true ? 'full' : 'fast';
  if (mode === 'full') {
    process.stderr.write('failover --full is not implemented until Session 11\n');
    return 1;
  }

  const { compile } = await import('@baton/compiler');
  const { lint } = await import('@baton/lint');
  const { render } = await import('@baton/render');
  const { collectArtifacts } = await import('./compile.js');
  const { renderHumanResult, renderHumanWarnings } = await import('../output/human.js');
  const { getLogger } = await import('../output/logger.js');
  const { redactForLog } = await import('../output/redact.js');

  const artifacts = collectArtifacts(repoRoot, packetId);
  const compileResult = await compile({
    packetId,
    repoRoot,
    mode,
    artifacts,
  });

  // Non-strict lint: only block on real errors, not warnings.
  const lintReport = lint(compileResult.packet, { repoRoot }, { strict: false });
  const blockingLint = lintReport.errors.length > 0;

  // Fix 1 (BLOCKER): block on EITHER lint errors OR schema invalid.
  // Previous condition (`&&`) let lint-erroring packets through whenever
  // the schema validated, silently shipping a bad BATON.md. The CLI
  // contract failover semantics require a hard stop on either gate.
  if (blockingLint || !compileResult.valid) {
    const reason =
      blockingLint && !compileResult.valid
        ? 'lint errors and schema invalid'
        : blockingLint
          ? 'lint errors'
          : 'schema invalid';
    const counts: string[] = [];
    if (blockingLint) counts.push(`${lintReport.errors.length} lint error(s)`);
    if (!compileResult.valid) counts.push('schema invalid');
    process.stderr.write(`failover stopped: ${reason} — ${counts.join(', ')}\n`);
    const { logger } = getLogger(repoRoot);
    logger.warn(
      redactForLog({
        command: 'failover',
        mode,
        exit_code: 2,
        duration_ms: Date.now() - start,
        packet_id: packetId,
        target,
        meta: { reason },
        shape: {
          lint_errors: lintReport.errors.length,
          schema_invalid: compileResult.valid ? 0 : 1,
        },
      }),
      'command complete',
    );
    return 2;
  }

  const rendered = render(compileResult.packet, target);

  // Fix 3: surface each compile + lint warning to stderr (human mode).
  // Previously the user only saw a count.
  const allWarnings = [
    ...compileResult.warnings.map((w) => ({
      code: w.code,
      message: w.message,
      path: w.path,
    })),
    ...lintReport.warnings.map((w) => ({
      code: w.code,
      message: w.message,
      path: w.path,
    })),
  ];

  if (opts.out !== undefined) {
    const outPath = isAbsolute(opts.out) ? opts.out : resolve(repoRoot, opts.out);
    mkdirSync(dirname(outPath), { recursive: true });
    writeFileSync(outPath, rendered.markdown, 'utf8');
    process.stdout.write(
      renderHumanResult({
        ok: true,
        title: `failover ready: ${packetId} → ${target}`,
        summary: `wrote ${outPath}`,
        details: [
          `${lintReport.summary.warningCount} warning(s)`,
          `${rendered.tokenEstimate} est. tokens`,
        ],
      }),
    );
    if (allWarnings.length > 0) process.stderr.write(renderHumanWarnings(allWarnings));
  } else if (opts.copy === true) {
    const { default: clipboardy } = await import('clipboardy');
    await clipboardy.write(rendered.markdown);
    process.stdout.write(
      renderHumanResult({
        ok: true,
        title: `failover ready: ${packetId} → ${target}`,
        summary: 'copied to clipboard',
        details: [`${lintReport.summary.warningCount} warning(s)`],
      }),
    );
    if (allWarnings.length > 0) process.stderr.write(renderHumanWarnings(allWarnings));
  } else {
    process.stdout.write(rendered.markdown);
    if (!rendered.markdown.endsWith('\n')) process.stdout.write('\n');
    if (allWarnings.length > 0) process.stderr.write(renderHumanWarnings(allWarnings));
  }

  const { logger } = getLogger(repoRoot);
  logger.info(
    redactForLog({
      command: 'failover',
      mode,
      exit_code: 0,
      duration_ms: Date.now() - start,
      packet_id: packetId,
      target,
      llm_calls_live: 0,
      llm_calls_cached: compileResult.cacheHits,
      tokens_in: 0,
      tokens_out: 0,
      fell_back_to_full: false,
      shape: {
        warnings: lintReport.summary.warningCount,
        artifacts: artifacts.length,
      },
    }),
    'command complete',
  );
  return 0;
}

export function registerFailover(program: Command): void {
  program
    .command('failover')
    .description('One-command handoff for the moment you hit a wall')
    .option('--from <tool>', 'source tool (claude-code|codex|cursor)')
    .option('--to <tool>', 'target tool (claude-code|codex|cursor|generic)', 'generic')
    .option('--packet <id>', 'packet id', 'current-task')
    .option('--copy', 'copy rendered handoff to clipboard', false)
    .option('--out <path>', 'write rendered handoff to path')
    .option('--full', 'use compile --full (slower, higher quality)', false)
    .option('--repo <path>', 'repo root', process.cwd())
    .action(async (raw: FailoverOptions) => {
      const code = await runFailover(raw);
      process.exitCode = code;
    });
}
