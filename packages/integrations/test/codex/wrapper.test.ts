import { Readable } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { runWrapperOnStream } from '../../src/codex/wrapper.js';

/**
 * Pipe a fake codex-like stdout containing one of the limit-marker
 * patterns through the wrapper. Assert the handoff trigger is invoked
 * exactly once and that the chunk is forwarded verbatim.
 */
function streamFromChunks(chunks: readonly string[]): Readable {
  let i = 0;
  return new Readable({
    read() {
      if (i >= chunks.length) {
        this.push(null);
        return;
      }
      const chunk = chunks[i] as string;
      i += 1;
      this.push(Buffer.from(chunk, 'utf8'));
    },
  });
}

describe('codex wrapper marker detection', () => {
  it('fires the handoff trigger exactly once on a marker hit', async () => {
    const stream = streamFromChunks([
      'Starting codex session...\n',
      'Processing your request...\n',
      'Error: Rate limit reached for this model. Please try again later.\n',
      'codex exited.\n',
    ]);
    const forwarded: string[] = [];
    const notifications: string[] = [];
    let triggers = 0;
    const result = await runWrapperOnStream(stream, {
      forward: (c) => {
        forwarded.push(c.toString('utf8'));
      },
      notify: (line) => {
        notifications.push(line);
      },
      onLimit: () => {
        triggers += 1;
      },
    });
    expect(result.triggered).toBe(true);
    expect(triggers).toBe(1);
    expect(forwarded.join('')).toContain('Rate limit reached');
    expect(forwarded.join('')).toContain('codex exited.');
    expect(notifications.length).toBe(1);
    expect(notifications[0]).toMatch(/handoff prepared/);
  });

  it('does not fire when no marker is present', async () => {
    const stream = streamFromChunks(['normal codex output\n', 'task done\n']);
    let triggers = 0;
    const result = await runWrapperOnStream(stream, {
      forward: () => {},
      notify: () => {},
      onLimit: () => {
        triggers += 1;
      },
    });
    expect(result.triggered).toBe(false);
    expect(triggers).toBe(0);
  });

  it('only fires once even if the marker repeats in the stream', async () => {
    const stream = streamFromChunks([
      'rate limit reached\n',
      'rate limit reached again\n',
      'usage limit\n',
    ]);
    let triggers = 0;
    const result = await runWrapperOnStream(stream, {
      forward: () => {},
      notify: () => {},
      onLimit: () => {
        triggers += 1;
      },
    });
    expect(result.triggered).toBe(true);
    expect(triggers).toBe(1);
  });

  it('detects markers spanning chunk boundaries', async () => {
    // Split "rate limit" across two chunks; the sliding window should
    // still match.
    const stream = streamFromChunks(['some output rate ', 'limit reached\n']);
    let triggers = 0;
    const result = await runWrapperOnStream(stream, {
      forward: () => {},
      notify: () => {},
      onLimit: () => {
        triggers += 1;
      },
    });
    expect(result.triggered).toBe(true);
    expect(triggers).toBe(1);
  });
});
