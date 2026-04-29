/**
 * Integration types — see tech spec §4.1 / §5.4 / §13.1.
 *
 * An "integration" is a per-tool installer that wires Baton into a
 * developer's coding agent (Claude Code, Codex CLI, Cursor, ...) without
 * mutating that tool's own config files outside an isolated plugin
 * directory.
 */

export type IntegrationMode = 'native-hook' | 'wrapper-launcher' | 'paste';

export interface DetectResult {
  installed: boolean;
  version?: string;
  reason?: string;
  /**
   * Resolved absolute path to the binary, or the bare name when the
   * binary was found via the host PATH. Consumers (e.g. wrappers) use
   * this to spawn the same binary detection landed on, which matters
   * when only an off-PATH desktop-app install exists.
   */
  path?: string;
}

export interface InstallOpts {
  mode?: IntegrationMode;
  pluginDir?: string;
  force?: boolean;
  /**
   * Repo root used for recording state under `.baton/integrations/`.
   * Defaults to `process.cwd()`.
   */
  repoRoot?: string;
}

export interface BackupRecord {
  sourcePath: string;
  backupPath: string;
  sha256: string;
}

/**
 * Per tech spec §5.4. The shape Baton commits to before any side effect:
 * a complete enumeration of files we will create, files we will modify,
 * external configs we will touch, and the hook events we will subscribe
 * to. Surfaced via `dryRun()` and rendered for the user before install.
 */
export interface InstallPlan {
  integrationId: string;
  mode: IntegrationMode;
  filesCreated: string[];
  filesModified: string[];
  externalConfigChanges: string[];
  hookEvents: string[];
  fallbackUsed: boolean;
  warnings: string[];
}

export interface InstallResult {
  plan: InstallPlan;
  backups: BackupRecord[];
}

export interface IntegrationStatus {
  id: string;
  mode: IntegrationMode;
  installedAt: string;
  pluginDir: string;
  backupRefs: string[];
}

export interface Integration {
  id: string;
  modes: readonly IntegrationMode[];
  preferredMode: IntegrationMode;
  detect(): Promise<DetectResult>;
  dryRun(opts: InstallOpts): Promise<InstallPlan>;
  install(opts: InstallOpts): Promise<InstallResult>;
  uninstall(opts?: { repoRoot?: string }): Promise<void>;
  status(opts?: { repoRoot?: string }): Promise<IntegrationStatus | null>;
}
