import "server-only";

import { db } from "@/lib/db";
import type { OnboardingInput, ProfileSettingsInput } from "@/lib/validation/onboarding";
import { createWorkspaceWithDefaults } from "@/server/services/workspaces";

function profileFields(input: OnboardingInput) {
  return {
    companyName: input.companyName,
    website: input.website ?? null,
    industry: input.industry,
    companySize: input.companySize,
    description: input.description ?? null,
    regions: input.regions,
    targetCustomerTypes: input.targetCustomerTypes,
    budgetMin: input.budgetMin ?? null,
    budgetMax: input.budgetMax ?? null,
    valueProposition: input.valueProposition,
  };
}

export async function completeOnboarding(
  userId: string,
  input: OnboardingInput,
): Promise<{ ok: true; workspaceId: string } | { ok: false; message: string }> {
  if (
    input.budgetMin !== undefined &&
    input.budgetMax !== undefined &&
    input.budgetMin > input.budgetMax
  ) {
    return { ok: false, message: "The minimum budget cannot be higher than the maximum." };
  }

  const existing = await db.membership.findFirst({
    where: { userId, workspace: { deletedAt: null } },
    orderBy: { createdAt: "asc" },
  });

  try {
    const workspaceId = await db.$transaction(async (tx) => {
      let id = existing?.workspaceId;

      if (!id) {
        const created = await createWorkspaceWithDefaults(tx, {
          ownerId: userId,
          name: input.companyName,
          onboardedAt: new Date(),
        });
        id = created.workspaceId;
      }

      await tx.workspace.update({
        where: { id },
        data: { name: input.companyName, onboardedAt: new Date() },
      });

      await tx.businessProfile.upsert({
        where: { workspaceId: id },
        update: profileFields(input),
        create: { workspaceId: id, ...profileFields(input) },
      });

      await tx.auditLog.create({
        data: {
          workspaceId: id,
          actorId: userId,
          action: "workspace.onboarding_completed",
          entityType: "Workspace",
          entityId: id,
          metadata: JSON.stringify({ industry: input.industry, regions: input.regions }),
        },
      });

      return id;
    });

    return { ok: true, workspaceId };
  } catch (error) {
    console.error("Onboarding failed", error);
    return { ok: false, message: "We could not save your profile. Please try again." };
  }
}

export async function updateBusinessProfile(
  userId: string,
  workspaceId: string,
  input: ProfileSettingsInput,
): Promise<{ ok: true } | { ok: false; message: string }> {
  if (
    input.budgetMin !== undefined &&
    input.budgetMax !== undefined &&
    input.budgetMin > input.budgetMax
  ) {
    return { ok: false, message: "The minimum budget cannot be higher than the maximum." };
  }

  const profileData = {
    ...profileFields(input),
    phone: input.phone ?? null,
    mailingAddress: input.mailingAddress ?? null,
    senderName: input.senderName ?? null,
    senderEmail: input.senderEmail?.toLowerCase() ?? null,
  };

  try {
    await db.$transaction([
      db.user.update({ where: { id: userId }, data: { name: input.name } }),
      db.workspace.update({
        where: { id: workspaceId },
        data: { name: input.workspaceName },
      }),
      db.businessProfile.upsert({
        where: { workspaceId },
        update: profileData,
        create: { workspaceId, ...profileData },
      }),
      db.auditLog.create({
        data: {
          workspaceId,
          actorId: userId,
          action: "workspace.profile_updated",
          entityType: "BusinessProfile",
          entityId: workspaceId,
          metadata: JSON.stringify({ fields: Object.keys(profileData) }),
        },
      }),
    ]);

    return { ok: true };
  } catch (error) {
    console.error("Profile update failed", error);
    return { ok: false, message: "We could not save your changes. Please try again." };
  }
}
