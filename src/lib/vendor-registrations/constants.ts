/** Max RawSearchResult rows processed in a single processVendorRegistrationResults() call — keeps one batch bounded regardless of backlog size. */
export const DEFAULT_PROCESSING_BATCH_SIZE = 25;
export const MAX_PROCESSING_BATCH_SIZE = 100;
