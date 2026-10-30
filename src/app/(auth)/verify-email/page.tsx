import Link from "next/link";

import { AuthCard } from "@/components/auth/auth-card";
import { VerifyEmailForm } from "@/components/auth/verify-email-form";

export const metadata = { title: "Verify your email" };

export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const token = typeof params.token === "string" ? params.token : "";

  return (
    <AuthCard
      title="Confirm your email"
      description="Verification links expire after 24 hours and can only be used once."
      footer={
        <p className="text-center">
          Wrong account?{" "}
          <Link href="/login" className="font-semibold text-brand hover:text-brand-dark">
            Sign in
          </Link>
        </p>
      }
    >
      <VerifyEmailForm token={token} />
    </AuthCard>
  );
}
