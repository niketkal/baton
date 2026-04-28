import { describe, expect, it, vi } from 'vitest';
import { main } from '../src/index.js';

describe('main', () => {
  it('returns 0 for --version', async () => {
    const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const code = await main(['node', 'baton', '--version']);
    expect(code).toBe(0);
    expect(stdout).toHaveBeenCalled();
    stdout.mockRestore();
  });

  it('returns 0 for --help', async () => {
    const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const code = await main(['node', 'baton', '--help']);
    expect(code).toBe(0);
    stdout.mockRestore();
    stderr.mockRestore();
  });

  it('returns 1 for unknown command', async () => {
    const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const code = await main(['node', 'baton', 'definitely-not-a-command']);
    expect(code).toBe(1);
    // Helpful error reaches stderr.
    expect(stderr).toHaveBeenCalled();
    stdout.mockRestore();
    stderr.mockRestore();
  });
});
