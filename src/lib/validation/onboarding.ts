import { z } from "zod";

const optionalText = (max: number, message?: string) =>
  z
    .string()
    .trim()
    .max(max, message ?? `Keep this under ${max} characters.`)
    .optional()
    .transform((value) => value || undefined);

const optionalUrl = z
  .string()
  .trim()
  .max(200, "Website is too long.")
  .optional()
  .transform((value) => value || undefined)
  .refine(
    (value) => !value || /^https?:\/\/[^\s]+\.[^\s]+$/i.test(value),
    "Enter a full URL, including https://.",
  );

const optionalInt = z.preprocess(
  (value) => (value === "" || value === null || value === undefined ? undefined : Number(value)),
  z.number().int("Enter a whole number.").min(0).max(1_000_000_000).optional(),
);

export const onboardingSchema = z.object({
  companyName: z
    .string()
    .trim()
    .min(2, "Enter your company name.")
    .max(120, "Company name is too long."),
  website: optionalUrl,
  industry: z.string().trim().min(1, "Choose an industry.").max(100),
  companySize: z.string().trim().min(1, "Choose a company size.").max(50),
  regions: z
    .string()
    .trim()
    .min(2, "Add at least one region or country.")
    .max(300, "Keep regions under 300 characters."),
  targetCustomerTypes: z
    .string()
    .trim()
    .min(2, "Choose at least one customer type.")
    .max(300, "Keep customer types under 300 characters."),
  budgetMin: optionalInt,
  budgetMax: optionalInt,
  description: optionalText(1200),
  valueProposition: z
    .string()
    .trim()
    .min(10, "Describe what you offer in at least 10 characters.")
    .max(1200, "Keep this under 1200 characters."),
});

export const profileSettingsSchema = onboardingSchema.extend({
  name: z.string().trim().min(2, "Enter your full name.").max(100),
  workspaceName: z
    .string()
    .trim()
    .min(2, "Enter a workspace name.")
    .max(100, "Workspace name is too long."),
  phone: optionalText(40),
  mailingAddress: optionalText(300),
  senderName: optionalText(100),
  senderEmail: z
    .string()
    .trim()
    .max(254)
    .optional()
    .transform((value) => value || undefined)
    .refine(
      (value) => !value || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value),
      "Enter a valid sender email.",
    ),
});

export type OnboardingInput = z.infer<typeof onboardingSchema>;
export type ProfileSettingsInput = z.infer<typeof profileSettingsSchema>;
