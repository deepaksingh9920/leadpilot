import { afterAll, describe, expect, it } from "vitest";

import { createTempDatabase, createTestTenant } from "@/test/temp-db";

// Email delivery is deliberately unconfigured. The invitation service records the
// invite and returns the share link even when the provider cannot send, which is
// what a self-hosted deployment without Resend sees.
const temp = createTempDatabase();
process.env.DATABASE_URL = temp.url;
process.env.APP_URL = "http://localhost:3000";
delete process.env.RESEND_API_KEY;
delete process.env.EMAIL_FROM;

const { db } = await import("@/lib/db");
const { hashPassword } = await import("@/lib/auth/password");
const { randomToken, sha256 } = await import("@/lib/security/hash");
const {
  INVITE_TTL_MS,
  acceptInvite,
  getInvitePreview,
  getTeamState,
  inviteMember,
  registerAndAcceptInvite,
  revokeInvite,
  transferWorkspaceOwnership,
} = await import("@/server/services/team");

type Tenant = Awaited<ReturnType<typeof createTestTenant>>;

let counter = 0;

function uniqueEmail(label: string): string {
  counter += 1;
  return `${label}-${counter}@example.test`;
}

async function createUser(email: string, name = "Teammate") {
  return db.user.create({
    data: { email, name, passwordHash: "not-a-real-hash", emailVerifiedAt: new Date() },
  });
}

async function addMember(workspaceId: string, userId: string, role: string) {
  return db.membership.create({ data: { workspaceId, userId, role } });
}

function tokenFromInviteUrl(inviteUrl: string): string {
  const marker = "/invite/";
  const index = inviteUrl.indexOf(marker);
  if (index === -1) throw new Error(`Invite URL did not contain ${marker}`);
  return inviteUrl.slice(index + marker.length);
}

async function invite(
  tenant: Tenant,
  email: string,
  role = "MEMBER",
  actorId = tenant.user.id,
) {
  const result = await inviteMember({
    workspaceId: tenant.workspace.id,
    actorId,
    email,
    role,
  });
  if (!result.ok) {
    throw new Error(`Expected invite to succeed, got ${result.code}: ${result.message}`);
  }
  return { ...result, token: tokenFromInviteUrl(result.inviteUrl) };
}

afterAll(async () => {
  await db.$disconnect();
  temp.cleanup();
});

describe("team invitations", () => {
  it("invites a member, reserves a seat, and exposes a safe preview", async () => {
    const tenant = await createTestTenant(db, { key: "team-invite", seatLimit: 3 });
    const email = uniqueEmail("new-member");

    const result = await invite(tenant, email, "MEMBER");

    expect(result.inviteUrl).toContain("/invite/");

    const state = await getTeamState(tenant.workspace.id);
    expect(state.memberships).toHaveLength(1);
    expect(state.invites).toHaveLength(1);
    expect(state.seatLimit).toBe(3);
    expect(state.seatsUsed).toBe(2);

    const preview = await getInvitePreview(result.token);
    expect(preview).toMatchObject({
      ok: true,
      email,
      role: "MEMBER",
      workspaceName: tenant.workspace.name,
      hasAccount: false,
    });

    const audit = await db.auditLog.findFirst({
      where: { workspaceId: tenant.workspace.id, action: "team.invite_sent" },
    });
    expect(audit?.metadata).toContain(email);
  });

  it("enforces invite permissions and prevents privilege escalation", async () => {
    const tenant = await createTestTenant(db, { key: "team-roles", seatLimit: 10 });
    const admin = await createUser(uniqueEmail("admin"));
    const member = await createUser(uniqueEmail("member"));
    const viewer = await createUser(uniqueEmail("viewer"));
    await addMember(tenant.workspace.id, admin.id, "ADMIN");
    await addMember(tenant.workspace.id, member.id, "MEMBER");
    await addMember(tenant.workspace.id, viewer.id, "VIEWER");

    const memberAttempt = await inviteMember({
      workspaceId: tenant.workspace.id,
      actorId: member.id,
      email: uniqueEmail("blocked-member"),
      role: "MEMBER",
    });
    expect(memberAttempt).toMatchObject({ ok: false, code: "FORBIDDEN" });

    const viewerAttempt = await inviteMember({
      workspaceId: tenant.workspace.id,
      actorId: viewer.id,
      email: uniqueEmail("blocked-viewer"),
      role: "VIEWER",
    });
    expect(viewerAttempt).toMatchObject({ ok: false, code: "FORBIDDEN" });

    const adminPromotesAdmin = await inviteMember({
      workspaceId: tenant.workspace.id,
      actorId: admin.id,
      email: uniqueEmail("blocked-admin"),
      role: "ADMIN",
    });
    expect(adminPromotesAdmin).toMatchObject({ ok: false, code: "FORBIDDEN" });

    const adminInvitesMember = await inviteMember({
      workspaceId: tenant.workspace.id,
      actorId: admin.id,
      email: uniqueEmail("admin-invited-member"),
      role: "MEMBER",
    });
    expect(adminInvitesMember.ok).toBe(true);

    const ownerInvitesAdmin = await inviteMember({
      workspaceId: tenant.workspace.id,
      actorId: tenant.user.id,
      email: uniqueEmail("owner-invited-admin"),
      role: "ADMIN",
    });
    expect(ownerInvitesAdmin.ok).toBe(true);
  });

  it("rejects duplicate pending invites and existing members", async () => {
    const tenant = await createTestTenant(db, { key: "team-duplicates", seatLimit: 10 });
    const existing = await createUser(uniqueEmail("existing"));
    await addMember(tenant.workspace.id, existing.id, "MEMBER");
    const email = uniqueEmail("duplicate");

    const first = await invite(tenant, ` ${email.toUpperCase()} `);

    const duplicate = await inviteMember({
      workspaceId: tenant.workspace.id,
      actorId: tenant.user.id,
      email,
      role: "MEMBER",
    });
    expect(duplicate).toMatchObject({ ok: false, code: "CONFLICT" });

    const alreadyMember = await inviteMember({
      workspaceId: tenant.workspace.id,
      actorId: tenant.user.id,
      email: existing.email,
      role: "VIEWER",
    });
    expect(alreadyMember).toMatchObject({ ok: false, code: "CONFLICT" });

    expect(first.inviteId).toBeTruthy();
  });

  it("reserves seats for pending invitations and releases them on revoke", async () => {
    const tenant = await createTestTenant(db, { key: "team-seats", seatLimit: 2 });

    const first = await invite(tenant, uniqueEmail("seat-one"));
    const overLimit = await inviteMember({
      workspaceId: tenant.workspace.id,
      actorId: tenant.user.id,
      email: uniqueEmail("seat-two"),
      role: "MEMBER",
    });
    expect(overLimit).toMatchObject({ ok: false, code: "LIMIT" });

    const blockedRevoke = await revokeInvite({
      workspaceId: tenant.workspace.id,
      actorId: await createUser(uniqueEmail("nonmember")).then((user) => user.id),
      inviteId: first.inviteId,
    });
    expect(blockedRevoke).toMatchObject({ ok: false, code: "NOT_FOUND" });

    const revoked = await revokeInvite({
      workspaceId: tenant.workspace.id,
      actorId: tenant.user.id,
      inviteId: first.inviteId,
    });
    expect(revoked.ok).toBe(true);
    expect(await db.invite.count({ where: { id: first.inviteId } })).toBe(0);

    const retry = await inviteMember({
      workspaceId: tenant.workspace.id,
      actorId: tenant.user.id,
      email: uniqueEmail("seat-two"),
      role: "MEMBER",
    });
    expect(retry.ok).toBe(true);

    const revokeAudit = await db.auditLog.findFirst({
      where: { workspaceId: tenant.workspace.id, action: "team.invite_revoked" },
    });
    expect(revokeAudit).toBeTruthy();

    const revokeMissing = await revokeInvite({
      workspaceId: tenant.workspace.id,
      actorId: tenant.user.id,
      inviteId: first.inviteId,
    });
    expect(revokeMissing).toMatchObject({ ok: false, code: "NOT_FOUND" });
  });

  it("lets an existing account accept an invitation, matching the invited email", async () => {
    const tenant = await createTestTenant(db, { key: "team-accept", seatLimit: 5 });
    const invitedEmail = uniqueEmail("accepted");
    const invitee = await createUser(invitedEmail, "Invited Person");
    const wrongUser = await createUser(uniqueEmail("wrong-account"));

    const created = await invite(tenant, invitedEmail, "VIEWER");

    const mismatch = await acceptInvite({ token: created.token, userId: wrongUser.id });
    expect(mismatch).toMatchObject({ ok: false, code: "FORBIDDEN" });

    const accepted = await acceptInvite({ token: created.token, userId: invitee.id });
    expect(accepted).toMatchObject({ ok: true, workspaceId: tenant.workspace.id });

    const membership = await db.membership.findUnique({
      where: {
        workspaceId_userId: { workspaceId: tenant.workspace.id, userId: invitee.id },
      },
    });
    expect(membership?.role).toBe("VIEWER");

    const inviteRow = await db.invite.findFirst({
      where: { workspaceId: tenant.workspace.id, email: invitedEmail },
    });
    expect(inviteRow?.acceptedAt).toBeInstanceOf(Date);

    const preview = await getInvitePreview(created.token);
    expect(preview).toMatchObject({ ok: false, code: "ACCEPTED" });

    const reused = await acceptInvite({ token: created.token, userId: invitee.id });
    expect(reused).toMatchObject({ ok: false, code: "ACCEPTED" });

    const audit = await db.auditLog.findFirst({
      where: { workspaceId: tenant.workspace.id, action: "team.invite_accepted" },
    });
    expect(audit?.actorId).toBe(invitee.id);
  });

  it("registers a new account from the invite and marks the email verified", async () => {
    const tenant = await createTestTenant(db, { key: "team-register", seatLimit: 5 });
    const email = uniqueEmail("brand-new");
    const created = await invite(tenant, email, "MEMBER");

    const result = await registerAndAcceptInvite({
      token: created.token,
      name: "Brand New",
      password: "SecurePass123",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.message);

    const user = await db.user.findUnique({ where: { id: result.userId } });
    expect(user?.email).toBe(email);
    expect(user?.emailVerifiedAt).toBeInstanceOf(Date);

    const membership = await db.membership.findUnique({
      where: {
        workspaceId_userId: { workspaceId: tenant.workspace.id, userId: result.userId },
      },
    });
    expect(membership?.role).toBe("MEMBER");

    const audit = await db.auditLog.findFirst({
      where: { workspaceId: tenant.workspace.id, action: "team.invite_accepted" },
    });
    expect(audit?.metadata).toContain('"newAccount":true');

    const replay = await registerAndAcceptInvite({
      token: created.token,
      name: "Brand New",
      password: "SecurePass123",
    });
    expect(replay).toMatchObject({ ok: false, code: "ACCEPTED" });
  });

  it("refuses invite registration when an account already exists for the email", async () => {
    const tenant = await createTestTenant(db, { key: "team-register-existing", seatLimit: 5 });
    const email = uniqueEmail("already-registered");
    await createUser(email, "Existing Person");
    const created = await invite(tenant, email);

    const result = await registerAndAcceptInvite({
      token: created.token,
      name: "Existing Person",
      password: "SecurePass123",
    });
    expect(result).toMatchObject({ ok: false, code: "CONFLICT" });
  });

  it("rejects expired invitations for preview, acceptance, and registration", async () => {
    const tenant = await createTestTenant(db, { key: "team-expired", seatLimit: 5 });
    const email = uniqueEmail("expired");
    const token = randomToken(32);
    const invitee = await createUser(email, "Expired Invitee");

    await db.invite.create({
      data: {
        workspaceId: tenant.workspace.id,
        email,
        role: "MEMBER",
        tokenHash: sha256(token),
        invitedById: tenant.user.id,
        expiresAt: new Date(Date.now() - 60_000),
      },
    });

    expect(await getInvitePreview(token)).toMatchObject({ ok: false, code: "EXPIRED" });
    expect(await acceptInvite({ token, userId: invitee.id })).toMatchObject({
      ok: false,
      code: "EXPIRED",
    });
    expect(
      await registerAndAcceptInvite({
        token,
        name: "Another Person",
        password: "SecurePass123",
      }),
    ).toMatchObject({ ok: false, code: "EXPIRED" });
  });

  it("refuses acceptance when the workspace is already at its seat limit", async () => {
    const tenant = await createTestTenant(db, { key: "team-accept-limit", seatLimit: 2 });
    const email = uniqueEmail("late-accept");
    const invitee = await createUser(email, "Late Acceptor");
    const created = await invite(tenant, email);

    // Simulate seats being consumed after the invitation was sent, e.g. an admin
    // adding someone directly or another invitation being accepted first.
    const directUser = await createUser(uniqueEmail("direct-add"));
    await addMember(tenant.workspace.id, directUser.id, "MEMBER");

    const result = await acceptInvite({ token: created.token, userId: invitee.id });
    expect(result).toMatchObject({ ok: false, code: "LIMIT" });
    expect(
      await db.membership.findUnique({
        where: {
          workspaceId_userId: { workspaceId: tenant.workspace.id, userId: invitee.id },
        },
      }),
    ).toBeNull();
  });

  it("keeps invitations scoped to their workspace", async () => {
    const tenantA = await createTestTenant(db, { key: "team-scope-a", seatLimit: 5 });
    const tenantB = await createTestTenant(db, { key: "team-scope-b", seatLimit: 5 });
    const created = await invite(tenantA, uniqueEmail("scoped"));

    const crossRevoke = await revokeInvite({
      workspaceId: tenantB.workspace.id,
      actorId: tenantB.user.id,
      inviteId: created.inviteId,
    });
    expect(crossRevoke).toMatchObject({ ok: false, code: "NOT_FOUND" });

    expect(await db.invite.count({ where: { workspaceId: tenantA.workspace.id } })).toBe(1);
    expect(await db.invite.count({ where: { workspaceId: tenantB.workspace.id } })).toBe(0);
  });

  it("sets a seven-day expiry on new invitations", async () => {
    const tenant = await createTestTenant(db, { key: "team-ttl", seatLimit: 5 });
    const before = Date.now();
    await invite(tenant, uniqueEmail("ttl"));

    const row = await db.invite.findFirst({
      where: { workspaceId: tenant.workspace.id },
      orderBy: { createdAt: "desc" },
    });
    expect(row).toBeTruthy();
    const delta = row!.expiresAt.getTime() - before;
    expect(delta).toBeGreaterThan(INVITE_TTL_MS - 60_000);
    expect(delta).toBeLessThan(INVITE_TTL_MS + 60_000);
  });
});

describe("workspace ownership transfer", () => {
  const password = "OwnerPassword9!";

  async function tenantWithPassword(key: string) {
    const tenant = await createTestTenant(db, { key, seatLimit: 10 });
    await db.user.update({
      where: { id: tenant.user.id },
      data: { passwordHash: await hashPassword(password) },
    });
    return tenant;
  }

  async function membershipRole(workspaceId: string, userId: string) {
    return (
      await db.membership.findUnique({
        where: { workspaceId_userId: { workspaceId, userId } },
      })
    )?.role;
  }

  it("refuses admins, self, viewers, missing members, and a wrong password", async () => {
    const tenant = await tenantWithPassword("transfer-guards");
    const admin = await createUser(uniqueEmail("transfer-admin"));
    const viewer = await createUser(uniqueEmail("transfer-viewer"));
    await addMember(tenant.workspace.id, admin.id, "ADMIN");
    await addMember(tenant.workspace.id, viewer.id, "VIEWER");

    const adminAttempt = await transferWorkspaceOwnership({
      workspaceId: tenant.workspace.id,
      actorId: admin.id,
      targetUserId: tenant.user.id,
      password,
    });
    expect(adminAttempt).toMatchObject({ ok: false, code: "FORBIDDEN" });

    const selfAttempt = await transferWorkspaceOwnership({
      workspaceId: tenant.workspace.id,
      actorId: tenant.user.id,
      targetUserId: tenant.user.id,
      password,
    });
    expect(selfAttempt).toMatchObject({ ok: false, code: "INVALID" });

    const viewerAttempt = await transferWorkspaceOwnership({
      workspaceId: tenant.workspace.id,
      actorId: tenant.user.id,
      targetUserId: viewer.id,
      password,
    });
    expect(viewerAttempt).toMatchObject({ ok: false, code: "INVALID" });

    const missingAttempt = await transferWorkspaceOwnership({
      workspaceId: tenant.workspace.id,
      actorId: tenant.user.id,
      targetUserId: "not-a-member",
      password,
    });
    expect(missingAttempt).toMatchObject({ ok: false, code: "INVALID" });

    const wrongPassword = await transferWorkspaceOwnership({
      workspaceId: tenant.workspace.id,
      actorId: tenant.user.id,
      targetUserId: admin.id,
      password: "WrongPassword9!",
    });
    expect(wrongPassword).toMatchObject({ ok: false, code: "INVALID" });

    const workspace = await db.workspace.findUniqueOrThrow({
      where: { id: tenant.workspace.id },
    });
    expect(workspace.ownerId).toBe(tenant.user.id);
    expect(await membershipRole(tenant.workspace.id, admin.id)).toBe("ADMIN");
  });

  it("moves ownerId and both roles in one transaction and audits the change", async () => {
    const tenant = await tenantWithPassword("transfer-success");
    const target = await createUser(uniqueEmail("transfer-target"), "New Owner");
    await addMember(tenant.workspace.id, target.id, "MEMBER");

    const result = await transferWorkspaceOwnership({
      workspaceId: tenant.workspace.id,
      actorId: tenant.user.id,
      targetUserId: target.id,
      password,
    });
    expect(result).toEqual({ ok: true, newOwnerName: "New Owner" });

    const workspace = await db.workspace.findUniqueOrThrow({
      where: { id: tenant.workspace.id },
    });
    expect(workspace.ownerId).toBe(target.id);
    expect(await membershipRole(tenant.workspace.id, tenant.user.id)).toBe("ADMIN");
    expect(await membershipRole(tenant.workspace.id, target.id)).toBe("OWNER");

    const audit = await db.auditLog.findFirst({
      where: {
        workspaceId: tenant.workspace.id,
        action: "workspace.ownership_transferred",
      },
    });
    expect(audit?.actorId).toBe(tenant.user.id);
    expect(JSON.parse(audit?.metadata ?? "{}")).toMatchObject({
      previousOwner: { id: tenant.user.id },
      nextOwner: { id: target.id },
    });

    // The former owner can no longer transfer it back.
    const formerOwnerAttempt = await transferWorkspaceOwnership({
      workspaceId: tenant.workspace.id,
      actorId: tenant.user.id,
      targetUserId: target.id,
      password,
    });
    expect(formerOwnerAttempt).toMatchObject({ ok: false, code: "FORBIDDEN" });
  });

  it("refuses a deleted workspace", async () => {
    const tenant = await tenantWithPassword("transfer-deleted");
    const target = await createUser(uniqueEmail("transfer-deleted-target"));
    await addMember(tenant.workspace.id, target.id, "MEMBER");
    await db.workspace.update({
      where: { id: tenant.workspace.id },
      data: { deletedAt: new Date() },
    });

    const result = await transferWorkspaceOwnership({
      workspaceId: tenant.workspace.id,
      actorId: tenant.user.id,
      targetUserId: target.id,
      password,
    });
    expect(result).toMatchObject({ ok: false, code: "NOT_FOUND" });
  });
});
