import { z } from "zod";

import { LEAD_SOURCE_PROVIDERS } from "@/lib/providers/types";

const apiKey = z
  .string()
  .trim()
  .min(8, "Paste the provider API key.")
  .max(4096, "This key is unexpectedly long.");

const optionalUrl = z
  .string()
  .trim()
  .max(300, "Base URL is too long.")
  .optional()
  .transform((value) => value || undefined)
  .refine(
    (value) => !value || /^https?:\/\/[^\s]+$/i.test(value),
    "Enter a full URL, including https://.",
  );

const optionalEmail = z
  .string()
  .trim()
  .max(254)
  .optional()
  .transform((value) => value || undefined)
  .refine(
    (value) => !value || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value),
    "Enter a valid email address.",
  );

export const aiCredentialsInputSchema = z.object({
  apiKey,
  model: z
    .string()
    .trim()
    .min(1, "Enter the model identifier, for example gpt-4.1-mini.")
    .max(200, "Model identifier is too long."),
  baseUrl: optionalUrl,
});

export const leadSourceCredentialsInputSchema = z.object({
  provider: z.enum(LEAD_SOURCE_PROVIDERS, "Choose Apollo, People Data Labs, or Google Places."),
  apiKey,
  baseUrl: optionalUrl,
});

export const emailCredentialsInputSchema = z.object({
  apiKey,
  from: z
    .string()
    .trim()
    .min(3, "Enter the sender address.")
    .max(254)
    .refine(
      (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value),
      "Enter a valid sender email address on a verified domain.",
    ),
  replyTo: optionalEmail,
});

export type AiCredentialsInput = z.infer<typeof aiCredentialsInputSchema>;
export type LeadSourceCredentialsInput = z.infer<typeof leadSourceCredentialsInputSchema>;
export type EmailCredentialsInput = z.infer<typeof emailCredentialsInputSchema>;
