import "server-only";

import { cache } from "react";
import { cookies } from "next/headers";

import { db } from "@/lib/db";
import { env, requireAuthSecret } from "@/lib/env";
import { randomToken, sha256 } from "@/lib/security/hash";

const SESSION_TTL_DAYS = 30;

export type SessionUser = {
  id: string;
  email: string;
  name: string;
  emailVerifiedAt: Date | null;
  isSuperAdmin: boolean;
};

export type SessionInfo = {
  id: string;
  expiresAt: Date;
  user: SessionUser;
};

function sessionExpiry(): Date {
  return new Date(Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000);
}

function cookieOptions(expires: Date) {
  return {
    httpOnly: true,
    secure: env.isProduction,
    sameSite: "lax" as const,
    path: "/",
    expires,
  };
}

export async function createSession(
  userId: string,
  meta: { ip?: string; userAgent?: string } = {},
): Promise<void> {
  // Validate configuration before issuing a session.
  requireAuthSecret();

  const token = randomToken(32);
  const expiresAt = sessionExpiry();

  await db.session.create({
    data: {
      tokenHash: sha256(token),
      userId,
      expiresAt,
      ip: meta.ip,
      userAgent: meta.userAgent,
    },
  });

  const cookieStore = await cookies();
  cookieStore.set(env.sessionCookieName, token, cookieOptions(expiresAt));
}

export const getSession = cache(async (): Promise<SessionInfo | null> => {
  const cookieStore = await cookies();
  const token = cookieStore.get(env.sessionCookieName)?.value;
  if (!token) return null;

  const session = await db.session.findUnique({
    where: { tokenHash: sha256(token) },
    include: {
      user: {
        select: {
          id: true,
          email: true,
          name: true,
          emailVerifiedAt: true,
          isSuperAdmin: true,
          disabledAt: true,
        },
      },
    },
  });

  if (!session) return null;
  if (session.expiresAt.getTime() <= Date.now()) {
    await db.session.delete({ where: { id: session.id } }).catch(() => undefined);
    return null;
  }
  if (session.user.disabledAt) return null;

  return {
    id: session.id,
    expiresAt: session.expiresAt,
    user: {
      id: session.user.id,
      email: session.user.email,
      name: session.user.name,
      emailVerifiedAt: session.user.emailVerifiedAt,
      isSuperAdmin: session.user.isSuperAdmin,
    },
  };
});

export async function destroyCurrentSession(): Promise<void> {
  const cookieStore = await cookies();
  const token = cookieStore.get(env.sessionCookieName)?.value;

  if (token) {
    await db.session
      .deleteMany({ where: { tokenHash: sha256(token) } })
      .catch(() => undefined);
  }

  cookieStore.delete(env.sessionCookieName);
}

export async function revokeOtherSessions(
  userId: string,
  keepSessionId: string,
): Promise<void> {
  await db.session.deleteMany({
    where: { userId, id: { not: keepSessionId } },
  });
}

export async function revokeAllSessions(userId: string): Promise<void> {
  await db.session.deleteMany({ where: { userId } });
}
