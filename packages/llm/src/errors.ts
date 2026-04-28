/**
 * Thrown when a provider's `complete()` is called but no credentials are
 * configured. The message is intentionally short so it can be surfaced
 * verbatim by `baton failover` and other CLI surfaces.
 */
export class LLMNotConfiguredError extends Error {
  readonly provider: string;
  constructor(provider: string, message?: string) {
    super(
      message ??
        `LLM provider "${provider}" is not configured. Set an API key or pick a different provider.`,
    );
    this.name = 'LLMNotConfiguredError';
    this.provider = provider;
  }
}

/**
 * Wraps any underlying SDK or network error so callers can `instanceof`
 * a single error type without taking a hard dep on each provider SDK.
 */
export class LLMProviderError extends Error {
  readonly provider: string;
  override readonly cause?: unknown;
  constructor(provider: string, message: string, cause?: unknown) {
    super(message);
    this.name = 'LLMProviderError';
    this.provider = provider;
    this.cause = cause;
  }
}
