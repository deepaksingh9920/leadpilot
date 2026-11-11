export const ROLE_RANK = {
  VIEWER: 1,
  MEMBER: 2,
  ADMIN: 3,
  OWNER: 4,
} as const;

export type WorkspaceRole = keyof typeof ROLE_RANK;

export function roleAtLeast(
  role: string | null | undefined,
  minimum: WorkspaceRole,
): boolean {
  if (!role) return false;
  const rank = ROLE_RANK[role as WorkspaceRole];
  return typeof rank === "number" && rank >= ROLE_RANK[minimum];
}

/**
 * Workspace approval policy can tighten outreach to the owner without changing
 * the role hierarchy. The default keeps admins able to approve and send.
 */
export const canApproveOutreach = (
  role: string | null | undefined,
  policy: string = "ADMIN_OR_OWNER",
) => roleAtLeast(role, policy === "OWNER_ONLY" ? "OWNER" : "ADMIN");
export const canManageBilling = (role: string | null | undefined) =>
  roleAtLeast(role, "OWNER");
export const canManageTeam = (role: string | null | undefined) =>
  roleAtLeast(role, "ADMIN");
export const canExportLeads = (role: string | null | undefined) =>
  roleAtLeast(role, "MEMBER");
