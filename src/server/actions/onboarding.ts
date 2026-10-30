"use server";

import { redirect } from "next/navigation";

import { checkRateLimit } from "@/lib/auth/rate-limit";
import { getSession } from "@/lib/auth/session";
import { setActiveWorkspace } from "@/lib/auth/workspace";
import { formString, toFieldErrors, type FormState } from "@/lib/form";
import { getClientIp } from "@/lib/request";
import { onboardingSchema } from "@/lib/validation/onboarding";
import { completeOnboarding } from "@/server/services/onboarding";

export async function completeOnboardingAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const session = await getSession();
  if (!session) {
    return { status: "error", message: "Your session expired. Sign in and try again." };
  }

  const parsed = onboardingSchema.safeParse({
    companyName: formString(formData, "companyName"),
    website: formString(formData, "website"),
    industry: formString(formData, "industry"),
    companySize: formString(formData, "companySize"),
    regions: formString(formData, "regions"),
    targetCustomerTypes: formString(formData, "targetCustomerTypes"),
    budgetMin: formString(formData, "budgetMin"),
    budgetMax: formString(formData, "budgetMax"),
    description: formString(formData, "description"),
    valueProposition: formString(formData, "valueProposition"),
  });

  if (!parsed.success) {
    return { status: "error", fieldErrors: toFieldErrors(parsed.error) };
  }

  const ip = await getClientIp();
  const limit = await checkRateLimit(`onboarding:${session.user.id}:${ip}`, 15, 60 * 60);
  if (!limit.allowed) {
    return {
      status: "error",
      message: "Too many attempts. Wait a few minutes before trying again.",
    };
  }

  const result = await completeOnboarding(session.user.id, parsed.data);
  if (!result.ok) {
    return { status: "error", message: result.message };
  }

  await setActiveWorkspace(result.workspaceId);
  redirect("/dashboard?welcome=1");
}
