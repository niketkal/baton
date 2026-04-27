import type { Packet } from '../src/types.js';

/**
 * A complete, schema-valid baseline packet. Each fixture under
 * `test/fixtures/<rule>/{good,bad}/packet.json` is built by mutating
 * a clone of this object so that ONLY the rule under test (or, for
 * BTN001/BTN002, the schema itself) can fire.
 *
 * Note: BTN001 and BTN002 are the only rules whose `bad` fixture is
 * legitimately schema-invalid. Every other `bad` fixture remains
 * schema-valid and breaks only the specific aspect the rule tests.
 */
export const BASE_GOOD_PACKET: Packet = {
  schema_version: 'baton.packet/v1',
  id: 'demo-packet',
  title: 'Demo packet',
  status: 'draft',
  validation_level: 'draft',
  task_type: 'generic',
  objective: 'Do the thing.',
  current_state: 'Nothing has happened yet.',
  next_action: 'Start.',
  open_questions: [],
  confidence_score: 0.5,
  repo_context: {
    attached: true,
    root: '/repo',
    vcs: 'git',
    branch: 'main',
    base_branch: 'main',
    commit: 'abc1234',
    base_commit: 'def5678',
    dirty: false,
  },
  context_items: [],
  constraints: [],
  attempts: [],
  acceptance_criteria: [],
  warnings: [],
  provenance_links: [],
  source_artifacts: [],
  created_at: '2026-04-27T00:00:00Z',
  updated_at: '2026-04-27T00:00:00Z',
};

export function clonePacket(overrides: Record<string, unknown> = {}): Packet {
  return JSON.parse(JSON.stringify({ ...BASE_GOOD_PACKET, ...overrides })) as Packet;
}
