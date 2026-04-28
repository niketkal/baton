/**
 * Integration error types. Thrown by install/uninstall paths so the CLI
 * layer can render distinct messages and pick the right exit code.
 */

export class IntegrationNotAvailableError extends Error {
  readonly integrationId: string;
  constructor(integrationId: string, reason: string) {
    super(`integration ${integrationId} not available: ${reason}`);
    this.name = 'IntegrationNotAvailableError';
    this.integrationId = integrationId;
  }
}

export class PluginDirUnresolvedError extends Error {
  readonly integrationId: string;
  constructor(integrationId: string, message: string) {
    super(message);
    this.name = 'PluginDirUnresolvedError';
    this.integrationId = integrationId;
  }
}

export class InstallFailedError extends Error {
  readonly integrationId: string;
  override readonly cause?: unknown;
  constructor(integrationId: string, message: string, cause?: unknown) {
    super(message);
    this.name = 'InstallFailedError';
    this.integrationId = integrationId;
    if (cause !== undefined) this.cause = cause;
  }
}
