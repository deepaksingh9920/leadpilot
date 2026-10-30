import "server-only";

import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { getSession } from "@/lib/auth/session";
import type { WorkspaceRole } from "@/lib/auth/roles";

export {
  ROLE_RANK,
  roleAtLeast,
  canApproveOutreach,
  canManageBilling,
  canManageTeam,
  canExportLeads,
  type WorkspaceRole,
} from "@/lib/auth/roles";

export const getAuthContext = cache(async () => {
  const session = await getSession();
  if (!session) return null;

  const memberships = await db.membership.findMany({
    where: {
      userId: session.user.id,
      workspace: { deletedAt: null },
    },
    include: {
      workspace: {
        include: {
          profile: true,
          subscription: {
            include: {
              plan: {
                include: { limits: true },
              },
            },
          },
        },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  const cookieStore = await cookies();
  const requestedWorkspaceId = cookieStore.get(env.workspaceCookieName)?.value;
  const active =
    memberships.find((membership) => membership.workspaceId === requestedWorkspaceId) ??
    memberships[0] ??
    null;

  const limits: Record<string, number> = {};
  for (const limit of active?.workspace.subscription?.plan.limits ?? []) {
    limits[limit.metric] = limit.limit;
  }

  return {
    session,
    user: session.user,
    memberships,
    workspace: active?.workspace ?? null,
    membership: active,
    role: (active?.role ?? null) as WorkspaceRole | null,
    plan: active?.workspace.subscription?.plan ?? null,
    limits,
  };
});

export async function requireUser() {
  const session = await getSession();
  if (!session) redirect("/login");
  return session;
}

export async function requireWorkspace(options?: { allowIncomplete?: boolean }) {
  const context = await getAuthContext();
  if (!context) redirect("/login");
  if (!context.workspace) redirect("/onboarding");
  if (!options?.allowIncomplete && !context.workspace.onboardedAt) {
    redirect("/onboarding");
  }
  return context;
}

export async function setActiveWorkspace(workspaceId: string): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(env.workspaceCookieName, workspaceId, {
    httpOnly: true,
    secure: env.isProduction,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
}

export { startOfMonthUTC } from "@/lib/utils";
