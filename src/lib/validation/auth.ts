import { z } from "zod";

export const emailSchema = z
  .string()
  .trim()
  .min(1, "Email is required.")
  .max(254, "Email is too long.")
  .email("Enter a valid email address.")
  .transform((value) => value.toLowerCase());

export const passwordSchema = z
  .string()
  .min(10, "Use at least 10 characters.")
  .max(128, "Password must be 128 characters or fewer.")
  .regex(/[A-Za-z]/, "Include at least one letter.")
  .regex(/[0-9]/, "Include at least one number.");

export const signupSchema = z.object({
  name: z.string().trim().min(2, "Enter your full name.").max(100, "Name is too long."),
  email: emailSchema,
  companyName: z
    .string()
    .trim()
    .min(2, "Enter your company or workspace name.")
    .max(100, "Company name is too long."),
  password: passwordSchema,
  acceptTerms: z.literal("on", {
    error: "You must accept the terms and privacy notice to continue.",
  }),
});

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Enter your password."),
  next: z.string().optional(),
});

export const forgotPasswordSchema = z.object({
  email: emailSchema,
});

export const resetPasswordSchema = z
  .object({
    token: z.string().min(10, "This reset link is invalid."),
    password: passwordSchema,
    confirmPassword: z.string().min(1, "Confirm your new password."),
  })
  .refine((values) => values.password === values.confirmPassword, {
    message: "Passwords do not match.",
    path: ["confirmPassword"],
  });

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Enter your current password."),
    newPassword: passwordSchema,
    confirmPassword: z.string().min(1, "Confirm your new password."),
  })
  .refine((values) => values.newPassword === values.confirmPassword, {
    message: "Passwords do not match.",
    path: ["confirmPassword"],
  });

export const deleteAccountSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Enter your current password."),
  confirm: z.literal("on", {
    error: "Confirm that you understand this cannot be undone.",
  }),
});

export function safeNextPath(value: string | null | undefined): string {
  if (!value) return "/dashboard";
  if (!value.startsWith("/") || value.startsWith("//")) return "/dashboard";
  return value;
}
