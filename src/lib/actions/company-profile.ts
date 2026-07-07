"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { requireActiveWorkspace } from "@/lib/workspace";
import { canEditCompanyProfile } from "@/lib/access-control";
import {
  approveCompanyProfile,
  generateCompanyProfile,
  updateCompanyProfile,
  NoAnalysisError,
} from "@/lib/company-profile/service";
import { ExtractionError } from "@/lib/company-profile/extract";
import { CompanyProfileSchema, toList, type CompanyProfileFormState } from "@/lib/validations/company-profile";

// Revalidated everywhere a profile can be viewed/edited: the dashboard page
// (which shows the approved profile's summary) and both routes that render
// this action's result — the dashboard review screen and the onboarding
// review step.
const PROFILE_PATHS = ["/dashboard", "/dashboard/company-profile", "/onboarding/review-profile"];

function revalidateProfilePaths() {
  for (const path of PROFILE_PATHS) revalidatePath(path);
}

export async function regenerateCompanyProfileAction(): Promise<{ error?: string } | undefined> {
  const active = await requireActiveWorkspace();
  if (!canEditCompanyProfile(active.role)) {
    return { error: "You don't have access to generate a company profile." };
  }

  try {
    await generateCompanyProfile(active.workspace.id);
  } catch (error) {
    if (error instanceof NoAnalysisError) {
      return { error: error.message };
    }
    if (error instanceof ExtractionError) {
      return { error: error.message };
    }
    return { error: "Couldn't generate a profile right now. Please try again." };
  }

  revalidateProfilePaths();
}

export async function updateCompanyProfileAction(
  _prevState: CompanyProfileFormState,
  formData: FormData,
): Promise<CompanyProfileFormState> {
  const active = await requireActiveWorkspace();
  if (!canEditCompanyProfile(active.role)) {
    return { message: "You don't have access to edit the company profile." };
  }

  const validatedFields = CompanyProfileSchema.safeParse({
    companyName: formData.get("companyName"),
    businessDescription: formData.get("businessDescription"),
    industry: formData.get("industry"),
    businessModel: formData.get("businessModel"),
    countriesServed: toList(formData.get("countriesServed")),
    headquarters: formData.get("headquarters"),
    operationType: formData.get("operationType"),
    certifications: toList(formData.get("certifications")),
    keyProductsServices: toList(formData.get("keyProductsServices")),
  });
  if (!validatedFields.success) {
    return { errors: validatedFields.error.flatten().fieldErrors };
  }

  await updateCompanyProfile(active.workspace.id, validatedFields.data);
  revalidateProfilePaths();
  return { message: "Changes saved." };
}

export async function approveCompanyProfileAction(): Promise<{ error?: string } | undefined> {
  const session = await auth();
  if (!session?.user?.id) {
    return { error: "You must be signed in." };
  }

  const active = await requireActiveWorkspace();
  if (!canEditCompanyProfile(active.role)) {
    return { error: "You don't have access to approve the company profile." };
  }

  await approveCompanyProfile(active.workspace.id, session.user.id);
  revalidateProfilePaths();
}
