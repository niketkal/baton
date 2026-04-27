/**
 * Known secret token prefixes used by BTN060's prefix-match heuristic.
 *
 * Sourced from public provider documentation:
 *  - `sk-`        — generic OpenAI-style API key prefix.
 *  - `sk-ant-`    — Anthropic API key prefix.
 *  - `ghp_`       — GitHub personal access token (classic & fine-grained user tokens).
 *  - `gho_`       — GitHub OAuth access token.
 *  - `ghu_`       — GitHub user-to-server token (used by GitHub Apps).
 *  - `ghs_`       — GitHub server-to-server token (GitHub Apps installation token).
 *  - `ghr_`       — GitHub refresh token.
 *  - `AKIA`       — AWS long-lived access key ID prefix.
 *  - `ASIA`       — AWS temporary (STS) access key ID prefix.
 *  - `xoxb-`      — Slack bot token.
 *  - `xoxp-`      — Slack user token.
 */
export const SECRET_PREFIXES: readonly string[] = Object.freeze([
  'sk-ant-',
  'sk-',
  'ghp_',
  'gho_',
  'ghu_',
  'ghs_',
  'ghr_',
  'AKIA',
  'ASIA',
  'xoxb-',
  'xoxp-',
]);
