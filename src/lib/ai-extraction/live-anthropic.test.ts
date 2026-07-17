import { describe, expect, it } from "vitest";

/**
 * Exercises the REAL Anthropic API path (src/lib/company-profile/extract.ts,
 * src/lib/product-discovery/extract.ts, via the dispatcher in ./service.ts)
 * with real, non-mock HTTP calls — the only test file in this suite that
 * makes a live external network call.
 *
 * Gated on RUN_LIVE_AI_TESTS=true (not merely on ANTHROPIC_API_KEY being
 * set) so a real-but-out-of-credits key sitting in the environment can never
 * cause this test to run and fail during a normal `npm test` — it only runs
 * when a developer explicitly opts in. Set both RUN_LIVE_AI_TESTS=true and a
 * real ANTHROPIC_API_KEY and re-run `npm test` (or
 * `npx vitest run src/lib/ai-extraction/live-anthropic.test.ts`) to verify
 * the real integration end-to-end.
 *
 * Also explicitly sets ENABLE_MOCK_AI=false so isMockAIEnabled() takes the
 * real branch even if a developer has it set to true in their local .env.
 */
const runLiveTests = process.env.RUN_LIVE_AI_TESTS === "true";

describe.skipIf(!runLiveTests)("live Anthropic integration (requires RUN_LIVE_AI_TESTS=true + ANTHROPIC_API_KEY)", () => {
  const prevMock = process.env.ENABLE_MOCK_AI;

  it("extractCompanyProfileAI returns a real, schema-valid extraction from Claude", async () => {
    process.env.ENABLE_MOCK_AI = "false";
    try {
      const { extractCompanyProfileAI } = await import("./service");
      const { CompanyProfileExtractionSchema } = await import("./zod-schemas");

      const fakeAnalysis = {
        id: "test",
        workspaceId: "test",
        url: "https://example.com",
        status: "COMPLETED",
        error: null,
        httpStatus: 200,
        robotsAllowed: true,
        title: "Acme Pumps — Industrial Centrifugal Pump Manufacturer",
        metaDescription: "Acme Pumps designs and manufactures centrifugal pumps for the oil and gas industry.",
        headings: { h1: ["Industrial Pumps for Oil & Gas"], h2: ["Our Products", "Certifications"], h3: [] },
        visibleText:
          "Acme Pumps has manufactured centrifugal pumps for the oil and gas industry since 1985. " +
          "ISO 9001 certified. Headquartered in Houston, Texas, serving customers across North America.",
        internalLinks: null,
        identifiedPages: null,
        rawResult: null,
        fetchedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any;

      const result = await extractCompanyProfileAI(fakeAnalysis);

      expect(CompanyProfileExtractionSchema.safeParse(result).success).toBe(true);
      expect(result.confidenceScore).toBeGreaterThan(0);
      // A real extraction over this content should surface the company name
      // and industry rather than leaving them blank.
      expect(result.companyName.length).toBeGreaterThan(0);
    } finally {
      if (prevMock === undefined) delete process.env.ENABLE_MOCK_AI;
      else process.env.ENABLE_MOCK_AI = prevMock;
    }
  }, 30_000);
});

describe("live Anthropic test gating", () => {
  it("is skipped unless RUN_LIVE_AI_TESTS=true, and that's expected in a normal test run", () => {
    // This assertion always runs (even when the suite above is skipped) so
    // `npm test` output makes clear *why* the live test didn't execute,
    // rather than a silently-skipped file looking like a missing test.
    if (!runLiveTests) {
      expect(process.env.RUN_LIVE_AI_TESTS).not.toBe("true");
    }
  });
});
