/**
 * Public API for `@baton/integrations`. Per-tool installer abstraction
 * + the registered integrations themselves. Imports must remain cheap:
 * the CLI cold-start path imports this module to enumerate integrations
 * during `baton init`.
 */

export { get as getIntegration, list as listIntegrations, register } from './registry.js';
export {
  IntegrationNotAvailableError,
  PluginDirUnresolvedError,
  InstallFailedError,
} from './errors.js';
export { claudeCodeIntegration } from './claude-code/index.js';
export { codexIntegration } from './codex/index.js';
export { cursorIntegration } from './cursor/index.js';
export { runWrapper, runWrapperOnStream } from './codex/wrapper.js';
export { LIMIT_MARKERS, hasLimitMarker } from './codex/markers.js';
export type {
  Integration,
  IntegrationMode,
  IntegrationStatus,
  DetectResult,
  InstallOpts,
  InstallPlan,
  InstallResult,
  BackupRecord,
} from './types.js';
