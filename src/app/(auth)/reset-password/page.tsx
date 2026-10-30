import Link from "next/link";

import { AuthCard } from "@/components/auth/auth-card";
import { ResetPasswordForm } from "@/components/auth/reset-password-form";

export const metadata = { title: "Choose a new password" };

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const token = typeof params.token === "string" ? params.token : "";

  return (
    <AuthCard
      title="Choose a new password"
      description="Your reset link can be used once and expires after one hour."
      footer={
        <p className="text-center">
          Need a new link?{" "}
          <Link
            href="/forgot-password"
            className="font-semibold text-brand hover:text-brand-dark"
          >
            Request another
          </Link>
        </p>
      }
    >
      <ResetPasswordForm token={token} />
    </AuthCard>
  );
}
