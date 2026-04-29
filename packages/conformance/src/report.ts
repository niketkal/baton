import type { ConformanceReport } from './types.js';

/**
 * Render a `ConformanceReport` for terminal or scripting consumption.
 *
 * - `human`: ascii table of case id / status / duration plus a
 *   per-failure list. No ANSI color (kept plain so that piped output
 *   stays clean — tech spec §4.1).
 * - `json`: pretty-printed JSON of the full report.
 */
export function formatReport(report: ConformanceReport, mode: 'human' | 'json'): string {
  if (mode === 'json') {
    return `${JSON.stringify(report, null, 2)}\n`;
  }
  const lines: string[] = [];
  lines.push(
    `baton conformance — ${report.passed}/${report.total} passed (bin: ${report.cli.binPath})`,
  );
  if (report.results.length === 0) {
    lines.push('  (no cases)');
    return `${lines.join('\n')}\n`;
  }
  // Build a small fixed-width table.
  const idWidth = Math.max(8, ...report.results.map((r) => r.caseId.length));
  const header = `  ${pad('case', idWidth)}  status  durationMs`;
  lines.push(header);
  lines.push(`  ${'-'.repeat(idWidth)}  ------  ----------`);
  for (const r of report.results) {
    const status = r.passed ? 'PASS' : 'FAIL';
    lines.push(
      `  ${pad(r.caseId, idWidth)}  ${pad(status, 6)}  ${String(r.durationMs).padStart(10, ' ')}`,
    );
  }
  // Failures detail.
  const failed = report.results.filter((r) => !r.passed);
  if (failed.length > 0) {
    lines.push('');
    lines.push('Failures:');
    for (const r of failed) {
      lines.push(`  - ${r.caseId}`);
      for (const f of r.failures) {
        lines.push(`      • ${f}`);
      }
    }
  }
  lines.push('');
  lines.push(
    report.failed === 0
      ? `OK — ${report.passed} case(s) passed`
      : `FAIL — ${report.failed} of ${report.total} case(s) failed`,
  );
  return `${lines.join('\n')}\n`;
}

function pad(s: string, width: number): string {
  return s.length >= width ? s : s + ' '.repeat(width - s.length);
}
