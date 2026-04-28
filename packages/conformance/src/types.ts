import type { BatonPacket } from '@baton/schema';

/**
 * Artifact kinds accepted by `baton ingest`. Mirrors
 * `compiler/types.ts` ArtifactType but redeclared locally so this
 * package keeps its tight dep set (schema + lint + render only).
 */
export type ArtifactType =
  | 'transcript'
  | 'log'
  | 'diff'
  | 'issue'
  | 'note'
  | 'image'
  | 'test-report';

export interface ArtifactRef {
  type: ArtifactType;
  /**
   * Path to the artifact file. Stored relative to `case.json` on
   * disk; the loader resolves to an absolute path before handing
   * to the runner.
   */
  uri: string;
  sourceTool?: string;
}

/**
 * A single conformance test case. Cases live as
 * `cases/<id>/case.json` with an `artifacts/` subdirectory.
 *
 * Cases are SYNTHETIC ONLY — no real partner transcripts. See
 * CLAUDE.md invariant 5 / tech spec §10.2.
 */
export interface ConformanceCase {
  id: string;
  description: string;
  input: {
    artifacts: ArtifactRef[];
    /**
     * Optional repo-fixture name. Reserved for future use; the
     * runner currently always uses a clean temp dir.
     */
    repoFixture?: string;
  };
  expected: {
    /**
     * Partial match: the runner only checks fields the case
     * specifies. Missing fields are not asserted.
     */
    packetShape: Partial<BatonPacket>;
    lintResult: {
      passed: boolean;
      codes?: string[];
    };
  };
}

export interface ConformanceResult {
  caseId: string;
  passed: boolean;
  failures: string[];
  durationMs: number;
}

export interface ConformanceReport {
  passed: number;
  failed: number;
  total: number;
  results: ConformanceResult[];
  cli: {
    binPath: string;
    version?: string;
  };
}

/**
 * Re-export `BatonPacket` under the local `Packet` alias for
 * downstream consumers who don't want to reach into `@baton/schema`.
 */
export type Packet = BatonPacket;
