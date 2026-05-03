import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
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

  describe('transcript buffering', () => {
    let workDir: string;
    let transcriptPath: string;
    beforeEach(() => {
      workDir = mkdtempSync(join(tmpdir(), 'baton-codex-wrapper-test-'));
      transcriptPath = join(workDir, 'transcript.txt');
    });
    afterEach(() => {
      // Windows occasionally holds the transcript file handle a tick
      // longer than the writable stream's `end` callback suggests; the
      // retry loop absorbs that without a flake.
      rmSync(workDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
    });

    it('buffers every stdout chunk to the transcript file', async () => {
      const stream = streamFromChunks([
        'first chunk\n',
        'second chunk\n',
        'third chunk with rate limit reached\n',
      ]);
      const result = await runWrapperOnStream(stream, {
        forward: () => {},
        notify: () => {},
        onLimit: () => {},
        transcriptPath,
      });
      expect(result.transcriptPath).toBe(transcriptPath);
      const written = readFileSync(transcriptPath, 'utf8');
      expect(written).toBe('first chunk\nsecond chunk\nthird chunk with rate limit reached\n');
    });

    it('passes the transcript path to onLimit', async () => {
      const stream = streamFromChunks(['some output\n', 'rate limit reached\n']);
      let receivedPath: string | undefined;
      await runWrapperOnStream(stream, {
        forward: () => {},
        notify: () => {},
        onLimit: (p) => {
          receivedPath = p;
        },
        transcriptPath,
      });
      expect(receivedPath).toBe(transcriptPath);
    });

    it('writes the transcript even when no marker fires', async () => {
      const stream = streamFromChunks(['quiet codex output\n']);
      await runWrapperOnStream(stream, {
        forward: () => {},
        notify: () => {},
        onLimit: () => {},
        transcriptPath,
      });
      expect(readFileSync(transcriptPath, 'utf8')).toBe('quiet codex output\n');
    });
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
