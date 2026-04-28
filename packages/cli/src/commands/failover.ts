import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, resolve } from 'node:path';
import { compile } from '@baton/compiler';
import { lint } from '@baton/lint';
import { render } from '@baton/render';
import type { RenderTarget } from '@baton/render';
import type { Command } from 'commander';
import { renderHumanResult } from '../output/human.js';
import { getLogger } from '../output/logger.js';
import { redactForLog } from '../output/redact.js';
import { collectArtifacts } from './compile.js';

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
  if (blockingLint && !compileResult.valid) {
    process.stderr.write(
      `failover stopped: packet ${packetId} has ${lintReport.errors.length} blocking issue(s)\n`,
    );
    const { logger } = getLogger(repoRoot);
    logger.warn(
      redactForLog({
        command: 'failover',
        mode,
        exit_code: 2,
        duration_ms: Date.now() - start,
        packet_id: packetId,
        target,
        shape: { lint_errors: lintReport.errors.length },
      }),
      'command complete',
    );
    return 2;
  }

  const rendered = render(compileResult.packet, target);

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
  } else {
    process.stdout.write(rendered.markdown);
    if (!rendered.markdown.endsWith('\n')) process.stdout.write('\n');
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
