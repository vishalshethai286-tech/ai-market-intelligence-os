import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const mockAuth = vi.fn();
const mockCookies = vi.fn();
const mockRedirect = vi.fn((url: string) => {
  throw new Error(`REDIRECT:${url}`);
});

vi.mock("@/auth", () => ({ auth: mockAuth }));
vi.mock("next/headers", () => ({ cookies: mockCookies }));
vi.mock("next/navigation", () => ({ redirect: mockRedirect }));

// Imported after the mocks above, same reasoning as src/lib/workspace.test.ts —
// these modules (transitively) import @/auth, next/headers, and next/navigation,
// none of which work outside a live Next.js request.
const { dbConnect } = await import("@/lib/mongodb");
const { User, Workspace, WorkspaceOnboarding } = await import("@/models");
const { createWorkspaceWithOwner } = await import("@/lib/workspace");
const { getOnboardingStatus, isOnboardingComplete } = await import("@/lib/onboarding");
const { saveWebsiteStep, saveWorkEmailStep, saveCountriesStep, saveCustomerTypesStep, completeOnboarding } =
  await import("./onboarding");

await dbConnect();

const TEST_PREFIX = "vitest-onboarding-";

function formData(fields: Record<string, string | string[]>): FormData {
  const fd = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    if (Array.isArray(value)) {
      for (const v of value) fd.append(key, v);
    } else {
      fd.set(key, value);
    }
  }
  return fd;
}

describe("onboarding save flow", () => {
  let userId: string;
  let workspaceId: string;

  beforeAll(async () => {
    const user = await User.create({ email: `${TEST_PREFIX}${Date.now()}@example.com`, name: "Onboarding Flow" });
    userId = user.id;
    const workspace = await createWorkspaceWithOwner("Onboarding Flow Co", userId);
    workspaceId = workspace.id;
  });

  afterAll(async () => {
    await Workspace.deleteMany({ _id: workspaceId });
    await User.deleteMany({ _id: userId });
  });

  beforeEach(() => {
    mockAuth.mockReset();
    mockCookies.mockReset();
    mockRedirect.mockClear();
    mockAuth.mockResolvedValue({ user: { id: userId } });
    mockCookies.mockResolvedValue({ get: () => ({ value: workspaceId }) });
  });

  it("starts NOT_STARTED at step 1 before anything is saved", async () => {
    const status = await getOnboardingStatus(workspaceId);
    expect(status.status).toBe("NOT_STARTED");
    expect(status.currentStep).toBe(1);
  });

  it("saveWebsiteStep normalizes the URL, persists it, and advances to step 2", async () => {
    await expect(saveWebsiteStep(undefined, formData({ companyWebsite: "acme.com" }))).rejects.toThrow(
      "REDIRECT:/onboarding/email",
    );

    const onboarding = await WorkspaceOnboarding.findOne({ workspaceId });
    expect(onboarding?.companyWebsite).toBe("https://acme.com");
    expect(onboarding?.status).toBe("IN_PROGRESS");
    expect(onboarding?.currentStep).toBe(2);
  });

  it("saveWorkEmailStep persists the email and advances to step 3", async () => {
    await expect(
      saveWorkEmailStep(undefined, formData({ workEmail: "buyer@acme.com" })),
    ).rejects.toThrow("REDIRECT:/onboarding/countries");

    const onboarding = await WorkspaceOnboarding.findOne({ workspaceId });
    expect(onboarding?.workEmail).toBe("buyer@acme.com");
    expect(onboarding?.currentStep).toBe(3);
  });

  it("saveCountriesStep accepts an empty selection (optional) and advances to step 4", async () => {
    await expect(saveCountriesStep(undefined, formData({}))).rejects.toThrow(
      "REDIRECT:/onboarding/customer-types",
    );

    const onboarding = await WorkspaceOnboarding.findOne({ workspaceId });
    expect(onboarding?.targetCountries).toEqual([]);
    expect(onboarding?.currentStep).toBe(4);
  });

  it("saveCustomerTypesStep accepts an empty selection (optional) and advances to step 5", async () => {
    await expect(saveCustomerTypesStep(undefined, formData({}))).rejects.toThrow("REDIRECT:/onboarding/start");

    const onboarding = await WorkspaceOnboarding.findOne({ workspaceId });
    expect(onboarding?.customerTypes).toEqual([]);
    expect(onboarding?.currentStep).toBe(5);

    const status = await getOnboardingStatus(workspaceId);
    expect(status.status).toBe("IN_PROGRESS");
    expect(status.currentStep).toBe(5);
    expect(status.currentStepSlug).toBe("start");
  });

  it("completeOnboarding marks the workspace COMPLETED", async () => {
    // Skips the AI/website-fetch-dependent start/review steps (exercised
    // elsewhere) — advance currentStep directly to simulate having reached
    // the final review step, same as requireOnboardingStep would after them.
    await WorkspaceOnboarding.updateOne({ workspaceId }, { currentStep: 7 });

    await expect(completeOnboarding()).rejects.toThrow("REDIRECT:/dashboard");

    expect(await isOnboardingComplete(workspaceId)).toBe(true);
    const status = await getOnboardingStatus(workspaceId);
    expect(status.status).toBe("COMPLETED");
  });
});
