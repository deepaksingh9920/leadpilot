import "server-only";

import { db } from "@/lib/db";

/**
 * Platform-wide kill switches. They are stored in the existing Setting table so
 * they survive restarts and are changed only by a superadmin through an audited
 * action. Defaults are enabled: absence of a row means the feature is on.
 */
export const FEATURE_FLAGS = [
  {
    key: "signups",
    label: "Public signups",
    description: "Allow new accounts to be created from the public signup page.",
    defaultValue: true,
  },
  {
    key: "csv_import",
    label: "CSV lead import",
    description:
      "Allow authorized lead lists to be imported from CSV. Disabling keeps existing leads and exports.",
    defaultValue: true,
  },
  {
    key: "outreach_sending",
    label: "Outreach sending",
    description:
      "Allow approved messages to be delivered. Drafting, approval, and suppression checks stay available.",
    defaultValue: true,
  },
] as const;

export type FeatureFlagKey = (typeof FEATURE_FLAGS)[number]["key"];

export type FeatureFlags = Record<FeatureFlagKey, boolean>;

const SETTING_PREFIX = "feature.";
const SETTING_KEYS = FEATURE_FLAGS.map((flag) => `${SETTING_PREFIX}${flag.key}`);

function parseFlag(raw: string | undefined, fallback: boolean): boolean {
  if (raw === undefined) return fallback;
  return raw === "true";
}

/** Reads every flag in one query; missing rows fall back to the documented default. */
export async function getFeatureFlags(): Promise<FeatureFlags> {
  const rows = await db.setting.findMany({ where: { key: { in: SETTING_KEYS } } });
  const stored = new Map(rows.map((row) => [row.key, row.value]));

  const flags = {} as FeatureFlags;
  for (const flag of FEATURE_FLAGS) {
    flags[flag.key] = parseFlag(stored.get(`${SETTING_PREFIX}${flag.key}`), flag.defaultValue);
  }
  return flags;
}

/** Server-side gate used by services before starting a side effect. */
export async function isFeatureEnabled(key: FeatureFlagKey): Promise<boolean> {
  const flag = FEATURE_FLAGS.find((candidate) => candidate.key === key);
  if (!flag) return false;

  const row = await db.setting.findUnique({
    where: { key: `${SETTING_PREFIX}${key}` },
    select: { value: true },
  });
  return parseFlag(row?.value, flag.defaultValue);
}

export function featureSettingKey(key: FeatureFlagKey): string {
  return `${SETTING_PREFIX}${key}`;
}
