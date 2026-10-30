import "server-only";

import { headers } from "next/headers";

export async function getClientIp(): Promise<string> {
  const headerList = await headers();
  const forwarded = headerList.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0]?.trim() || "unknown";
  }
  return headerList.get("x-real-ip") ?? "unknown";
}

export async function getUserAgent(): Promise<string> {
  const headerList = await headers();
  return headerList.get("user-agent")?.slice(0, 500) ?? "unknown";
}
