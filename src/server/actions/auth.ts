"use server";

import { redirect } from "next/navigation";

import { checkRateLimit } from "@/lib/auth/rate-limit";
import { createSession, destroyCurrentSession, getSession } from "@/lib/auth/session";
import { env } from "@/lib/env";
import { formString, toFieldErrors, type FormState } from "@/lib/form";
import { getClientIp, getUserAgent } from "@/lib/request";
import {
  forgotPasswordSchema,
  loginSchema,
  resetPasswordSchema,
  safeNextPath,
  signupSchema,
} from "@/lib/validation/auth";
import {
  issueVerificationEmail,
  requestPasswordReset,
  resetPassword,
  signIn,
  signUp,
  verifyEmail,
} from "@/server/services/auth";

function rateLimitMessage(retryAfterSeconds: number): string {
  const minutes = Math.ceil(retryAfterSeconds / 60);
  return `Too many attempts. Try again in about ${minutes} minute${minutes === 1 ? "" : "s"}.`;
}

export async function signupAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = signupSchema.safeParse({
    name: formString(formData, "name"),
    email: formString(formData, "email"),
    companyName: formString(formData, "companyName"),
    password: formString(formData, "password"),
    acceptTerms: formString(formData, "acceptTerms"),
  });

  if (!parsed.success) {
    return { status: "error", fieldErrors: toFieldErrors(parsed.error) };
  }

  const ip = await getClientIp();
  const limit = await checkRateLimit(`signup:${ip}`, 3, 60 * 60);
  if (!limit.allowed) {
    return { status: "error", message: rateLimitMessage(limit.retryAfterSeconds) };
  }

  const result = await signUp({
    name: parsed.data.name,
    email: parsed.data.email,
    companyName: parsed.data.companyName,
    password: parsed.data.password,
  });

  if (!result.ok) {
    return {
      status: "error",
      message: result.message,
      fieldErrors: result.code === "EMAIL_TAKEN" ? { email: [result.message] } : undefined,
    };
  }

  await createSession(result.userId, { ip, userAgent: await getUserAgent() });
  redirect("/onboarding");
}

export async function loginAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = loginSchema.safeParse({
    email: formString(formData, "email"),
    password: formString(formData, "password"),
    next: formString(formData, "next"),
  });

  if (!parsed.success) {
    return { status: "error", fieldErrors: toFieldErrors(parsed.error) };
  }

  const ip = await getClientIp();
  const limit = await checkRateLimit(
    `login:${ip}:${parsed.data.email.toLowerCase()}`,
    5,
    15 * 60,
  );
  if (!limit.allowed) {
    return { status: "error", message: rateLimitMessage(limit.retryAfterSeconds) };
  }

  const result = await signIn(parsed.data.email, parsed.data.password, {
    ip,
    userAgent: await getUserAgent(),
  });

  if (!result.ok) {
    return { status: "error", message: result.message };
  }

  await createSession(result.userId, { ip, userAgent: await getUserAgent() });
  redirect(safeNextPath(parsed.data.next));
}

export async function logoutAction(): Promise<void> {
  await destroyCurrentSession();
  redirect("/");
}

export async function forgotPasswordAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = forgotPasswordSchema.safeParse({
    email: formString(formData, "email"),
  });

  if (!parsed.success) {
    return { status: "error", fieldErrors: toFieldErrors(parsed.error) };
  }

  const ip = await getClientIp();
  const limit = await checkRateLimit(`forgot:${ip}`, 5, 60 * 60);
  if (!limit.allowed) {
    return { status: "error", message: rateLimitMessage(limit.retryAfterSeconds) };
  }

  await requestPasswordReset(parsed.data.email);

  if (!env.emailConfigured) {
    return {
      status: "error",
      message:
        "Password reset email is not configured in this environment. Add RESEND_API_KEY and EMAIL_FROM on the server, then try again.",
    };
  }

  return {
    status: "success",
    message:
      "If an account exists for that email, a reset link is on its way. The link expires in one hour.",
  };
}

export async function resetPasswordAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = resetPasswordSchema.safeParse({
    token: formString(formData, "token"),
    password: formString(formData, "password"),
    confirmPassword: formString(formData, "confirmPassword"),
  });

  if (!parsed.success) {
    return { status: "error", fieldErrors: toFieldErrors(parsed.error) };
  }

  const ip = await getClientIp();
  const limit = await checkRateLimit(`reset:${ip}`, 5, 60 * 60);
  if (!limit.allowed) {
    return { status: "error", message: rateLimitMessage(limit.retryAfterSeconds) };
  }

  const result = await resetPassword(parsed.data.token, parsed.data.password);
  if (!result.ok) {
    return { status: "error", message: result.message };
  }

  redirect("/login?reset=1");
}

export async function verifyEmailAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const token = formString(formData, "token");
  if (!token) {
    return { status: "error", message: "This verification link is invalid." };
  }

  const result = await verifyEmail(token);
  if (!result.ok) {
    return { status: "error", message: result.message };
  }

  return {
    status: "success",
    message: "Email verified. Your account is now confirmed.",
  };
}

export async function resendVerificationAction(): Promise<FormState> {
  const session = await getSession();
  if (!session) return { status: "error", message: "Sign in to continue." };
  if (session.user.emailVerifiedAt) {
    return { status: "success", message: "Your email is already verified." };
  }
  if (!env.emailConfigured) {
    return {
      status: "error",
      message:
        "Email delivery is not configured yet. Add RESEND_API_KEY and EMAIL_FROM on the server.",
    };
  }

  const limit = await checkRateLimit(`verify-email:${session.user.id}`, 3, 60 * 60);
  if (!limit.allowed) {
    return { status: "error", message: rateLimitMessage(limit.retryAfterSeconds) };
  }

  const result = await issueVerificationEmail(session.user.id);
  if (!result.ok) {
    return { status: "error", message: result.message };
  }

  return { status: "success", message: "Verification email sent. Check your inbox." };
}

export async function resendVerificationFormAction(
  _previous: FormState,
  _formData: FormData,
): Promise<FormState> {
  void _previous;
  void _formData;
  return resendVerificationAction();
}
