import { describe, expect, it } from 'vitest';
import { ReadonlyTamperError, assertNoReadonlyEdits } from '../src/markdown-readonly.js';
import { serializePacketToMarkdown } from '../src/markdown.js';
import { makePacket } from './fixtures/packets.js';

describe('assertNoReadonlyEdits', () => {
  it('passes when the read-only block is identical', () => {
    const packet = makePacket();
    const md = serializePacketToMarkdown(packet);
    expect(() => assertNoReadonlyEdits(md, md, packet)).not.toThrow();
  });

  it('throws ReadonlyTamperError when a fake provenance link is inserted', () => {
    const packet = makePacket();
    const md = serializePacketToMarkdown(packet);
    const tampered = md.replace(
      '### Provenance links\n\n_None._',
      '### Provenance links\n\n- `pl-fake` objective ← made-up-artifact (transcript) [0..1]',
    );
    expect(md).not.toBe(tampered);

    let caught: unknown;
    try {
      assertNoReadonlyEdits(md, tampered, packet);
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(ReadonlyTamperError);
    const err = caught as ReadonlyTamperError;
    expect(err.message).toContain('system-managed');
    expect(err.offendingLines.join('\n')).toContain('pl-fake');
  });

  it('throws when a read-only line is deleted', () => {
    const packet = makePacket();
    const md = serializePacketToMarkdown(packet);
    const tampered = md.replace(/- \*\*Updated at:\*\*[^\n]+\n/, '');
    expect(() => assertNoReadonlyEdits(md, tampered, packet)).toThrow(ReadonlyTamperError);
  });
});
