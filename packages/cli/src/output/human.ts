/**
 * Pretty-print a result for terminal output. Color codes only applied
 * when stdout is a TTY (per tech spec §4.1 / §12 — never assume color).
 */

const ANSI = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
};

function shouldColor(): boolean {
  if (process.env.NO_COLOR !== undefined) return false;
  return Boolean(process.stdout.isTTY);
}

function paint(code: keyof typeof ANSI, text: string): string {
  if (!shouldColor()) return text;
  return `${ANSI[code]}${text}${ANSI.reset}`;
}

export interface HumanResult {
  ok: boolean;
  title?: string;
  summary?: string;
  details?: string[];
}

export function renderHumanResult(data: HumanResult): string {
  const lines: string[] = [];
  if (data.title !== undefined) {
    const tag = data.ok ? paint('green', 'ok') : paint('red', 'fail');
    lines.push(`${tag} ${paint('bold', data.title)}`);
  }
  if (data.summary !== undefined) {
    lines.push(paint('dim', data.summary));
  }
  if (data.details !== undefined && data.details.length > 0) {
    for (const d of data.details) lines.push(`  ${d}`);
  }
  return lines.length === 0 ? '' : `${lines.join('\n')}\n`;
}

export function colorize(code: keyof typeof ANSI, text: string): string {
  return paint(code, text);
}

export interface WarningLine {
  code: string;
  message: string;
  path?: string | undefined;
}

/**
 * Render a list of warnings as `[warn] CODE: message (path)` lines.
 * Returns "" when warnings is empty so callers can write unconditionally.
 *
 * Targeted at stderr in human mode — JSON mode already includes the
 * structured warnings array.
 */
export function renderHumanWarnings(warnings: WarningLine[]): string {
  if (warnings.length === 0) return '';
  const tag = paint('yellow', '[warn]');
  const lines: string[] = [];
  for (const w of warnings) {
    const suffix = w.path !== undefined && w.path !== '' ? ` (${w.path})` : '';
    lines.push(`${tag} ${w.code}: ${w.message}${suffix}`);
  }
  return `${lines.join('\n')}\n`;
}
