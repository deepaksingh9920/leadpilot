import { z } from "zod";

import { emailSchema, passwordSchema } from "@/lib/validation/auth";

export const TEAM_INVITE_ROLES = ["ADMIN", "MEMBER", "VIEWER"] as const;

export const inviteMemberSchema = z.object({
  email: emailSchema,
  role: z.enum(TEAM_INVITE_ROLES, { error: "Choose a valid role." }),
});

export const acceptInviteRegistrationSchema = z
  .object({
    token: z.string().min(10, "This invitation link is invalid."),
    name: z.string().trim().min(2, "Enter your full name.").max(100, "Name is too long."),
    password: passwordSchema,
    confirmPassword: z.string().min(1, "Confirm your new password."),
  })
  .refine((values) => values.password === values.confirmPassword, {
    message: "Passwords do not match.",
    path: ["confirmPassword"],
  });
