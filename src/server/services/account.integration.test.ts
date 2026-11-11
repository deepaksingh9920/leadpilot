import { afterAll, describe, expect, it } from "vitest";

import { createTempDatabase, createTestTenant } from "@/test/temp-db";

// Account closure must work without email delivery; nothing in this path sends mail.
const temp = createTempDatabase();
process.env.DATABASE_URL = temp.url;
process.env.APP_URL = "http://localhost:3000";
delete process.env.RESEND_API_KEY;
delete process.env.EMAIL_FROM;

const { db } = await import("@/lib/db");
const { hashPassword, verifyPassword } = await import("@/lib/auth/password");
const { randomToken, sha256 } = await import("@/lib/security/hash");
const { signIn } = await import("@/server/services/auth");
const { deleteAccount, getAccountDeletionState } = await import(
  "@/server/services/account"
);

const PASSWORD = "AccountClose9!";
let counter = 0;

function uniqueEmail(label: string): string {
  counter += 1;
  return `${label}-${counter}@example.test`;
}

async function createUser(
  email: string,
  options: { name?: string; isSuperAdmin?: boolean } = {},
) {
  return db.user.create({
    data: {
      email,
      name: options.name ?? "Account Owner",
      passwordHash: await hashPassword(PASSWORD),
      emailVerifiedAt: new Date(),
      isSuperAdmin: options.isSuperAdmin ?? false,
    },
  });
}

async function addPendingInvite(workspaceId: string, email: string, invitedById: string) {
  return db.invite.create({
    data: {
      workspaceId,
      email,
      role: "MEMBER",
      tokenHash: sha256(randomToken()),
      invitedById,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    },
  });
}

afterAll(async () => {
  await db.$disconnect();
  temp.cleanup();
});

describe("account deletion", () => {
  it("refuses a wrong email, a wrong password, and superadmin accounts", async () => {
    const user = await createUser(uniqueEmail("guarded"));
    const wrongEmail = await deleteAccount({
      userId: user.id,
      emailConfirmation: "someone-else@example.test",
      password: PASSWORD,
    });
    expect(wrongEmail).toMatchObject({ ok: false, code: "INVALID" });

    const wrongPassword = await deleteAccount({
      userId: user.id,
      emailConfirmation: user.email,
      password: "WrongPassword9!",
    });
    expect(wrongPassword).toMatchObject({ ok: false, code: "INVALID" });

    const superadmin = await createUser(uniqueEmail("superadmin"), {
      isSuperAdmin: true,
    });
    const adminAttempt = await deleteAccount({
      userId: superadmin.id,
      emailConfirmation: superadmin.email,
      password: PASSWORD,
    });
    expect(adminAttempt).toMatchObject({ ok: false, code: "FORBIDDEN" });

    for (const id of [user.id, superadmin.id]) {
      const row = await db.user.findUniqueOrThrow({ where: { id } });
      expect(row.disabledAt).toBeNull();
    }
  });

  it("refuses while the account owns an active workspace, then allows it once deleted", async () => {
    const tenant = await createTestTenant(db, { key: "account-owner" });
    await db.user.update({
      where: { id: tenant.user.id },
      data: { passwordHash: await hashPassword(PASSWORD) },
    });

    const blocked = await deleteAccount({
      userId: tenant.user.id,
      emailConfirmation: tenant.user.email,
      password: PASSWORD,
    });
    expect(blocked).toMatchObject({ ok: false, code: "CONFLICT" });
    expect(
      await db.membership.count({
        where: { workspaceId: tenant.workspace.id, userId: tenant.user.id },
      }),
    ).toBe(1);

    await db.workspace.update({
      where: { id: tenant.workspace.id },
      data: { deletedAt: new Date() },
    });

    const allowed = await deleteAccount({
      userId: tenant.user.id,
      emailConfirmation: tenant.user.email,
      password: PASSWORD,
    });
    expect(allowed).toMatchObject({ ok: true });

    // The soft-deleted workspace keeps its ownerId so retention purge still works.
    const workspace = await db.workspace.findUniqueOrThrow({
      where: { id: tenant.workspace.id },
    });
    expect(workspace.ownerId).toBe(tenant.user.id);
    expect(workspace.deletedAt).not.toBeNull();
  });

  it("anonymizes the account and removes sessions, tokens, invites, and memberships", async () => {
    const tenantA = await createTestTenant(db, { key: "account-a" });
    const tenantB = await createTestTenant(db, { key: "account-b" });
    const memberEmail = uniqueEmail("closing-member");
    const user = await createUser(memberEmail, { name: "Closing Member" });
    await db.membership.create({
      data: { workspaceId: tenantA.workspace.id, userId: user.id, role: "MEMBER" },
    });
    await db.membership.create({
      data: { workspaceId: tenantB.workspace.id, userId: user.id, role: "ADMIN" },
    });

    await db.session.createMany({
      data: [1, 2].map(() => ({
        tokenHash: sha256(randomToken()),
        userId: user.id,
        expiresAt: new Date(Date.now() + 60_000),
      })),
    });
    await db.emailToken.createMany({
      data: ["VERIFY_EMAIL", "RESET_PASSWORD"].map((type) => ({
        userId: user.id,
        type,
        tokenHash: sha256(randomToken()),
        expiresAt: new Date(Date.now() + 60_000),
      })),
    });
    await addPendingInvite(tenantA.workspace.id, memberEmail, tenantA.user.id);
    await addPendingInvite(tenantB.workspace.id, memberEmail, tenantB.user.id);
    const unrelated = await addPendingInvite(
      tenantA.workspace.id,
      uniqueEmail("unrelated"),
      tenantA.user.id,
    );

    expect(await getAccountDeletionState(user.id)).toEqual({
      ownedActiveWorkspaces: 0,
      membershipCount: 2,
    });

    const result = await deleteAccount({
      userId: user.id,
      emailConfirmation: memberEmail.toUpperCase(),
      password: PASSWORD,
      ip: "127.0.0.1",
      userAgent: "vitest",
    });
    expect(result).toEqual({
      ok: true,
      membershipsRemoved: 2,
      invitesRemoved: 2,
      sessionsRevoked: 2,
    });

    const closed = await db.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(closed.email).toBe(`deleted+${user.id}@deleted.invalid`);
    expect(closed.name).toBe("Deleted user");
    expect(closed.emailVerifiedAt).toBeNull();
    expect(closed.disabledAt).not.toBeNull();
    expect(await verifyPassword(PASSWORD, closed.passwordHash)).toBe(false);

    expect(await db.session.count({ where: { userId: user.id } })).toBe(0);
    expect(await db.emailToken.count({ where: { userId: user.id } })).toBe(0);
    expect(await db.membership.count({ where: { userId: user.id } })).toBe(0);
    expect(await db.invite.count({ where: { email: memberEmail } })).toBe(0);
    expect(await db.invite.count({ where: { id: unrelated.id } })).toBe(1);

    const audit = await db.auditLog.findFirst({
      where: { actorId: user.id, action: "account.deleted" },
    });
    expect(audit?.workspaceId).toBeNull();
    expect(audit?.entityId).toBe(user.id);
    expect(JSON.parse(audit?.metadata ?? "{}")).toMatchObject({
      membershipsRemoved: 2,
      invitesRemoved: 2,
      sessionsRevoked: 2,
    });

    expect((await signIn(memberEmail, PASSWORD)).ok).toBe(false);

    const secondAttempt = await deleteAccount({
      userId: user.id,
      emailConfirmation: memberEmail,
      password: PASSWORD,
    });
    expect(secondAttempt).toMatchObject({ ok: false, code: "NOT_FOUND" });
  });

  it("keeps audit entries and workspace records attributable after closure", async () => {
    const tenant = await createTestTenant(db, { key: "account-audit" });
    const user = await createUser(uniqueEmail("audited-member"));
    await db.membership.create({
      data: { workspaceId: tenant.workspace.id, userId: user.id, role: "MEMBER" },
    });
    await db.auditLog.create({
      data: {
        workspaceId: tenant.workspace.id,
        actorId: user.id,
        action: "lead.updated",
        entityType: "Lead",
        entityId: "lead-1",
      },
    });

    const closed = await deleteAccount({
      userId: user.id,
      emailConfirmation: user.email,
      password: PASSWORD,
    });
    expect(closed).toMatchObject({ ok: true });
    expect(
      await db.auditLog.count({ where: { workspaceId: tenant.workspace.id, actorId: user.id } }),
    ).toBe(1);
  });
});
