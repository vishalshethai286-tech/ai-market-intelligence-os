/** duplicateScore thresholds shared by every recordType's scoring function. 95+ auto-merges, 75-94 goes to Pending Review, below 75 is ignored entirely. */
export const DUPLICATE_SCORE_THRESHOLDS = {
  autoMerge: 95,
  review: 75,
} as const;

/**
 * Caps how many existing records a single deduplication scan compares
 * against (both the manual "Run Deduplication" scan and the per-record
 * check the customer processor triggers after creating a new customer).
 * Deliberately simple O(n^2) pairwise comparison within this cap rather than
 * a candidate-blocking index — fine at MVP scale, revisit if workspaces grow
 * large enough for this to matter.
 */
export const DEDUP_SCAN_LIMIT = 200;
