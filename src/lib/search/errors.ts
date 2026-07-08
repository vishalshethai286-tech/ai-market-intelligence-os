/** Thrown when a provider is selected but its required API key(s) aren't set. */
export class SearchProviderNotConfiguredError extends Error {}

/** Thrown when a provider's API responds with an error status or unexpected shape. */
export class SearchProviderRequestError extends Error {}

/** Thrown when `search()` is asked for a provider name that isn't registered. */
export class UnknownSearchProviderError extends Error {}
