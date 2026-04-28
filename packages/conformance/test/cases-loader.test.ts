import { existsSync, readFileSync } from 'node:fs';
import { isAbsolute } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CASE_MANIFEST, listCaseDirs, loadCases } from '../src/cases/index.js';

describe('loadCases', () => {
  it('returns every case in the manifest with absolute artifact paths', () => {
    const cases = loadCases();
    expect(cases).toHaveLength(CASE_MANIFEST.length);
    expect(cases.map((c) => c.id).sort()).toEqual(CASE_MANIFEST.map((m) => m.id).sort());
    for (const c of cases) {
      for (const a of c.input.artifacts) {
        expect(isAbsolute(a.uri)).toBe(true);
        expect(existsSync(a.uri)).toBe(true);
      }
    }
  });

  it('matches the on-disk case directory listing', () => {
    const dirs = listCaseDirs();
    for (const m of CASE_MANIFEST) {
      expect(dirs).toContain(m.dir);
    }
  });

  it('case fixtures contain no real-looking competitor product names', () => {
    const FORBIDDEN = ['cli-continues', 'hydra', 'signet'];
    const cases = loadCases();
    for (const c of cases) {
      for (const a of c.input.artifacts) {
        const body = readFileSync(a.uri, 'utf8').toLowerCase();
        for (const word of FORBIDDEN) {
          expect(body).not.toContain(word);
        }
      }
    }
  });
});
