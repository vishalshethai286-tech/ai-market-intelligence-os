/**
 * Whether AI extraction should use the deterministic mock path instead of a
 * real model call. True if explicitly enabled via ENABLE_MOCK_AI, or
 * implicitly whenever no AI provider key is configured — so onboarding never
 * hard-fails in an environment without a real key (local dev, CI, tests).
 *
 * This project's configured AI provider is Anthropic Claude (ANTHROPIC_API_KEY,
 * already wired into src/lib/company-profile and src/lib/product-discovery) —
 * not OpenAI. See PROJECT_STATUS.md for why OPENAI_API_KEY was not introduced
 * as a second, unused provider.
 */
export function isMockAIEnabled(): boolean {
  if (process.env.ENABLE_MOCK_AI === "true") return true;
  return !process.env.ANTHROPIC_API_KEY;
}
