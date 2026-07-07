"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getOrCreateOnboarding, requireOnboardingStep, stepPath } from "@/lib/onboarding";
import { canStartNewAnalysis, runAndStoreWebsiteAnalysis } from "@/lib/website-analysis";
import {
  CountriesSchema,
  CustomerTypesSchema,
  WebsiteSchema,
  WorkEmailSchema,
  type CountriesFormState,
  type CustomerTypesFormState,
  type WebsiteFormState,
  type WorkEmailFormState,
} from "@/lib/validations/onboarding";

async function saveStep(workspaceId: string, data: Record<string, unknown>, nextStep: number) {
  const onboarding = await getOrCreateOnboarding(workspaceId);
  await prisma.workspaceOnboarding.update({
    where: { workspaceId },
    data: {
      ...data,
      status: "IN_PROGRESS",
      currentStep: Math.max(onboarding.currentStep, nextStep),
    },
  });
}

export async function saveWebsiteStep(
  _prevState: WebsiteFormState,
  formData: FormData,
): Promise<WebsiteFormState> {
  const { active } = await requireOnboardingStep("website");

  const validatedFields = WebsiteSchema.safeParse({
    companyWebsite: formData.get("companyWebsite"),
  });
  if (!validatedFields.success) {
    return { errors: validatedFields.error.flatten().fieldErrors };
  }

  await saveStep(active.workspace.id, { companyWebsite: validatedFields.data.companyWebsite }, 2);
  redirect(stepPath("email"));
}

export async function saveWorkEmailStep(
  _prevState: WorkEmailFormState,
  formData: FormData,
): Promise<WorkEmailFormState> {
  const { active } = await requireOnboardingStep("email");

  const validatedFields = WorkEmailSchema.safeParse({
    workEmail: formData.get("workEmail"),
  });
  if (!validatedFields.success) {
    return { errors: validatedFields.error.flatten().fieldErrors };
  }

  await saveStep(active.workspace.id, { workEmail: validatedFields.data.workEmail }, 3);
  redirect(stepPath("countries"));
}

export async function saveCountriesStep(
  _prevState: CountriesFormState,
  formData: FormData,
): Promise<CountriesFormState> {
  const { active } = await requireOnboardingStep("countries");

  const validatedFields = CountriesSchema.safeParse({
    targetCountries: formData.getAll("targetCountries"),
  });
  if (!validatedFields.success) {
    return { errors: validatedFields.error.flatten().fieldErrors };
  }

  await saveStep(active.workspace.id, { targetCountries: validatedFields.data.targetCountries }, 4);
  redirect(stepPath("customer-types"));
}

export async function saveCustomerTypesStep(
  _prevState: CustomerTypesFormState,
  formData: FormData,
): Promise<CustomerTypesFormState> {
  const { active } = await requireOnboardingStep("customer-types");

  const validatedFields = CustomerTypesSchema.safeParse({
    customerTypes: formData.getAll("customerTypes"),
  });
  if (!validatedFields.success) {
    return { errors: validatedFields.error.flatten().fieldErrors };
  }

  await saveStep(active.workspace.id, { customerTypes: validatedFields.data.customerTypes }, 5);
  redirect(stepPath("start"));
}

/**
 * Kicks off the website analyzer for the workspace's homepage (best-effort —
 * a failed fetch doesn't block onboarding), marks onboarding complete, and
 * sends the user to the dashboard.
 */
export async function startAnalysis() {
  const { active, onboarding } = await requireOnboardingStep("start");

  if (onboarding.companyWebsite && (await canStartNewAnalysis(active.workspace.id))) {
    try {
      await runAndStoreWebsiteAnalysis(active.workspace.id, onboarding.companyWebsite);
    } catch {
      // Analysis is best-effort enrichment — don't block onboarding on it.
    }
  }

  await prisma.workspaceOnboarding.update({
    where: { workspaceId: active.workspace.id },
    data: { status: "COMPLETED", completedAt: new Date() },
  });

  redirect("/dashboard");
}
