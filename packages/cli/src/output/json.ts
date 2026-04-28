/**
 * Render a structured result for `--json` mode. Stable shape so
 * agent/script consumers can rely on it.
 */
export function renderJsonResult(data: unknown): string {
  return `${JSON.stringify(data, null, 2)}\n`;
}
