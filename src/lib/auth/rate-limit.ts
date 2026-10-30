import "server-only";

import { db } from "@/lib/db";

export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
};

/**
 * Fixed-window rate limiter backed by the database. The unique constraint on
 * (key, windowStart) makes the increment safe across concurrent requests.
 */
export async function checkRateLimit(
  key: string,
  limit: number,
  windowSeconds: number,
): Promise<RateLimitResult> {
  const now = Date.now();
  const windowMs = windowSeconds * 1000;
  const windowStart = new Date(Math.floor(now / windowMs) * windowMs);

  try {
    const bucket = await db.rateLimitBucket.upsert({
      where: { key_windowStart: { key, windowStart } },
      create: { key, windowStart, count: 1 },
      update: { count: { increment: 1 } },
    });

    // Opportunistic cleanup so the table does not grow indefinitely.
    if (Math.random() < 0.02) {
      await db.rateLimitBucket
        .deleteMany({ where: { windowStart: { lt: new Date(now - 24 * 60 * 60 * 1000) } } })
        .catch(() => undefined);
    }

    return {
      allowed: bucket.count <= limit,
      remaining: Math.max(0, limit - bucket.count),
      retryAfterSeconds: Math.max(
        1,
        Math.ceil((windowStart.getTime() + windowMs - now) / 1000),
      ),
    };
  } catch (error) {
    // Fail closed on infrastructure errors for sensitive endpoints.
    console.error("Rate limit check failed", error);
    return { allowed: false, remaining: 0, retryAfterSeconds: 60 };
  }
}
