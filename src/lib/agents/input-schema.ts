/**
 * Minimal JSON-schema reader for agent run forms.
 *
 * Agent definitions store a small draft-07-shaped object schema in the database.
 * We support the subset the seeds use (string, integer, array of strings, enum,
 * minimum/maximum, required) and reject anything else rather than guessing.
 */

export type AgentInputProperty = {
  name: string;
  type: "string" | "integer" | "array";
  required: boolean;
  description?: string;
  enum?: string[];
  minimum?: number;
  maximum?: number;
};

export type AgentInputSchema = {
  properties: AgentInputProperty[];
  required: string[];
  parseError?: string;
};

type RawProperty = {
  type?: unknown;
  description?: unknown;
  enum?: unknown;
  minimum?: unknown;
  maximum?: unknown;
};

export function parseAgentInputSchema(raw: string | null | undefined): AgentInputSchema {
  if (!raw || raw.trim() === "" || raw.trim() === "{}") {
    return { properties: [], required: [] };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { properties: [], required: [], parseError: "The agent input schema is not valid JSON." };
  }

  if (!isRecord(parsed) || !isRecord(parsed.properties)) {
    return { properties: [], required: [], parseError: "The agent input schema has no properties." };
  }

  const required = Array.isArray(parsed.required)
    ? parsed.required.filter((item): item is string => typeof item === "string")
    : [];

  const properties: AgentInputProperty[] = [];
  for (const [name, definition] of Object.entries(parsed.properties)) {
    if (!isRecord(definition)) continue;
    const property = toProperty(name, definition as RawProperty, required.includes(name));
    if (property) properties.push(property);
  }

  return { properties, required };
}

function toProperty(
  name: string,
  definition: RawProperty,
  required: boolean,
): AgentInputProperty | null {
  const type =
    definition.type === "array"
      ? "array"
      : definition.type === "integer" || definition.type === "number"
        ? "integer"
        : definition.type === "string"
          ? "string"
          : null;
  if (!type) return null;

  const item: AgentInputProperty = { name, type, required };
  if (typeof definition.description === "string") item.description = definition.description;
  if (
    Array.isArray(definition.enum) &&
    definition.enum.every((value) => typeof value === "string")
  ) {
    item.enum = definition.enum as string[];
  }
  if (typeof definition.minimum === "number") item.minimum = definition.minimum;
  if (typeof definition.maximum === "number") item.maximum = definition.maximum;
  return item;
}

export type AgentInputResult =
  | { ok: true; value: Record<string, unknown> }
  | { ok: false; errors: Record<string, string[]> };

/**
 * Validates raw form values against the schema. Array fields accept repeated
 * values and comma-separated input, so both checkbox UIs and pasted IDs work.
 */
export function validateAgentInput(
  schema: AgentInputSchema,
  raw: Record<string, string | string[] | undefined>,
): AgentInputResult {
  const errors: Record<string, string[]> = {};
  const value: Record<string, unknown> = {};

  for (const property of schema.properties) {
    const rawValue = raw[property.name];
    const values = Array.isArray(rawValue)
      ? rawValue
      : typeof rawValue === "string"
        ? [rawValue]
        : [];
    const cleaned = values
      .flatMap((item) => item.split(","))
      .map((item) => item.trim())
      .filter(Boolean);

    if (cleaned.length === 0) {
      if (property.required) {
        errors[property.name] = [`${labelForProperty(property.name)} is required.`];
      }
      continue;
    }

    if (property.type === "array") {
      const unique = [...new Set(cleaned)];
      if (unique.some((item) => item.length > 100)) {
        errors[property.name] = ["One or more values are too long."];
      } else {
        value[property.name] = unique;
      }
      continue;
    }

    if (property.type === "integer") {
      const single = cleaned[0];
      const parsed = Number(single.replace(/,/g, ""));
      if (!Number.isInteger(parsed)) {
        errors[property.name] = [`${labelForProperty(property.name)} must be a whole number.`];
      } else if (property.minimum !== undefined && parsed < property.minimum) {
        errors[property.name] = [
          `${labelForProperty(property.name)} must be at least ${property.minimum}.`,
        ];
      } else if (property.maximum !== undefined && parsed > property.maximum) {
        errors[property.name] = [
          `${labelForProperty(property.name)} must be at most ${property.maximum}.`,
        ];
      } else {
        value[property.name] = parsed;
      }
      continue;
    }

    const single = cleaned[0];
    if (property.enum && !property.enum.includes(single)) {
      errors[property.name] = [`Choose one of: ${property.enum.join(", ")}.`];
      continue;
    }
    if (single.length > 500) {
      errors[property.name] = ["Value is too long."];
      continue;
    }
    value[property.name] = single;
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, value };
}

export function labelForProperty(name: string): string {
  const labels: Record<string, string> = {
    industry: "Industry",
    region: "Region",
    companySize: "Company size",
    targetCustomerType: "Target customer type",
    limit: "Maximum results",
    leadId: "Lead",
    leadIds: "Leads",
    campaignId: "Campaign",
  };
  return labels[name] ?? name.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase());
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
