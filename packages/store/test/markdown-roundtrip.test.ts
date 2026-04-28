import { describe, expect, it } from 'vitest';
import { parseMarkdownToPacket, serializePacketToMarkdown } from '../src/markdown.js';
import { makePacket } from './fixtures/packets.js';

describe('packet.md round-trip (editable fields)', () => {
  it('serializes then parses back losslessly when no edits are made', () => {
    const packet = makePacket({
      objective: 'Ship the editable packet.md surface.',
      current_state: 'Serializer + parser are in place; tests pending.',
      next_action: 'Wire round-trip test and assert lossless behavior.',
      acceptance_criteria: [
        {
          id: 'ac-001',
          text: 'Serializer emits read-only fences.',
          status: 'unmet',
          required: true,
          source: 'derived',
          provenance_refs: [],
        },
        {
          id: 'ac-002',
          text: 'Parser drops new untagged items.',
          status: 'unmet',
          required: false,
          source: 'derived',
          provenance_refs: [],
        },
      ],
      constraints: [
        {
          id: 'cn-001',
          type: 'technical',
          text: 'Read-only blocks must not be rewritten by remark.',
          severity: 'warning',
          source: 'repo',
          provenance_refs: ['pl-1'],
        },
      ],
      open_questions: [
        {
          id: 'oq-001',
          text: 'Should new list items round-trip into packet.json?',
          blocking: false,
          status: 'open',
        },
      ],
    });

    const md = serializePacketToMarkdown(packet);
    const parsed = parseMarkdownToPacket(md, packet);
    expect(parsed.edits).toEqual([]);
    expect(parsed.readonlyTampered).toBe(false);
    expect(parsed.packet.objective).toBe(packet.objective);
    expect(parsed.packet.current_state).toBe(packet.current_state);
    expect(parsed.packet.next_action).toBe(packet.next_action);
    expect(parsed.packet.title).toBe(packet.title);
    expect(parsed.packet.acceptance_criteria).toEqual(packet.acceptance_criteria);
    expect(parsed.packet.constraints).toEqual(packet.constraints);
    expect(parsed.packet.open_questions).toEqual(packet.open_questions);
    // System-managed fields are taken verbatim from currentPacket.
    expect(parsed.packet.confidence_score).toBe(packet.confidence_score);
    expect(parsed.packet.warnings).toEqual(packet.warnings);
    expect(parsed.packet.provenance_links).toEqual(packet.provenance_links);
  });

  it('detects an edit to objective and reflects it in the parsed packet', () => {
    const packet = makePacket({
      objective: 'Original objective text.',
    });
    const md = serializePacketToMarkdown(packet);
    const edited = md.replace(
      'Original objective text.',
      'Updated objective the user wrote in their editor.',
    );
    const parsed = parseMarkdownToPacket(edited, packet);
    expect(parsed.edits).toContain('objective');
    expect(parsed.packet.objective).toBe('Updated objective the user wrote in their editor.');
  });

  it('detects an edit to acceptance_criteria text and preserves the id', () => {
    const packet = makePacket({
      acceptance_criteria: [
        {
          id: 'ac-001',
          text: 'Original AC text.',
          status: 'unmet',
          required: true,
          source: 'derived',
          provenance_refs: [],
        },
      ],
    });
    const md = serializePacketToMarkdown(packet);
    const edited = md.replace('Original AC text.', 'Edited AC text.');
    const parsed = parseMarkdownToPacket(edited, packet);
    expect(parsed.edits).toContain('acceptance_criteria');
    expect(parsed.packet.acceptance_criteria).toHaveLength(1);
    expect(parsed.packet.acceptance_criteria[0]?.id).toBe('ac-001');
    expect(parsed.packet.acceptance_criteria[0]?.text).toBe('Edited AC text.');
  });
});
