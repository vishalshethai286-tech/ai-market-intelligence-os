export const EXTRACTION_MODEL = "claude-opus-4-8";
export const EXTRACTION_MAX_TOKENS = 8192;

/** Caps how much of the analyzed homepage text we spend tokens on per extraction. */
export const MAX_VISIBLE_TEXT_FOR_PROMPT = 4_000;
/** Caps how many links per page-category are sent as context (they're signals, not fetched content). */
export const MAX_LINKS_PER_CATEGORY_FOR_PROMPT = 10;

export const OPERATION_TYPES = [
  "MANUFACTURER",
  "TRADER",
  "SERVICE_PROVIDER",
  "OTHER",
  "UNKNOWN",
] as const;

export const OPERATION_TYPE_LABELS: Record<(typeof OPERATION_TYPES)[number], string> = {
  MANUFACTURER: "Manufacturer",
  TRADER: "Trader / distributor",
  SERVICE_PROVIDER: "Service provider",
  OTHER: "Other",
  UNKNOWN: "Unknown",
};
