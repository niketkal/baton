import { detectSecrets } from '../secrets/detect.js';
import type { LintRule, LintRuleResult, Packet } from '../types.js';

/**
 * BTN060 no_apparent_secrets_in_artifacts
 *
 * Scans the packet for apparent secrets in places that would be carried
 * to dispatch or cloud sync: narrative fields, context-item refs/reasons,
 * provenance excerpts, attempt summaries / failure reasons, source-artifact
 * URIs. Uses prefix, PEM, env-style, and high-entropy heuristics.
 *
 * Critical, fails in strict mode (per canonical rule doc).
 */
function pushSecrets(findings: LintRuleResult, text: unknown, path: string): void {
  if (typeof text !== 'string' || text.length === 0) return;
  const hits = detectSecrets(text);
  for (const hit of hits) {
    findings.push({
      message: `Possible ${hit.kind === 'pem' ? 'PEM private key' : hit.kind === 'env' ? '.env-style credential' : hit.kind === 'prefix' ? 'token prefix' : 'high-entropy secret'} detected at ${path}.`,
      path,
    });
  }
}

export const BTN060: LintRule = {
  code: 'BTN060',
  severity: 'critical',
  failInStrict: true,
  description:
    'artifacts prepared for dispatch must not contain apparent secrets, tokens, private keys, or credentials',
  check(packet: Packet) {
    const findings: LintRuleResult = [];

    pushSecrets(findings, packet.objective, '/objective');
    pushSecrets(findings, packet.current_state, '/current_state');
    pushSecrets(findings, packet.next_action, '/next_action');

    const items = Array.isArray(packet.context_items) ? packet.context_items : [];
    items.forEach((item, i) => {
      pushSecrets(findings, (item as { ref?: unknown }).ref, `/context_items/${i}/ref`);
      pushSecrets(findings, (item as { reason?: unknown }).reason, `/context_items/${i}/reason`);
    });

    const links = Array.isArray(packet.provenance_links) ? packet.provenance_links : [];
    links.forEach((l, i) => {
      pushSecrets(findings, (l as { excerpt?: unknown }).excerpt, `/provenance_links/${i}/excerpt`);
      pushSecrets(findings, (l as { ref?: unknown }).ref, `/provenance_links/${i}/ref`);
    });

    const attempts = Array.isArray(packet.attempts) ? packet.attempts : [];
    attempts.forEach((a, i) => {
      pushSecrets(findings, (a as { summary?: unknown }).summary, `/attempts/${i}/summary`);
      pushSecrets(
        findings,
        (a as { failure_reason?: unknown }).failure_reason,
        `/attempts/${i}/failure_reason`,
      );
    });

    const artifacts = Array.isArray(packet.source_artifacts) ? packet.source_artifacts : [];
    artifacts.forEach((s, i) => {
      pushSecrets(findings, (s as { uri?: unknown }).uri, `/source_artifacts/${i}/uri`);
    });

    return findings;
  },
};
