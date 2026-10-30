import Link from "next/link";
import { redirect } from "next/navigation";

import { AuthCard } from "@/components/auth/auth-card";
import { SignupForm } from "@/components/auth/signup-form";
import { getSession } from "@/lib/auth/session";

export const metadata = { title: "Create your workspace" };

const planNames: Record<string, string> = {
  starter: "Starter",
  professional: "Professional",
  agency: "Agency",
};

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await getSession();
  if (session) redirect("/dashboard");

  const params = await searchParams;
  const planKey = typeof params.plan === "string" ? params.plan : undefined;
  const planName = planKey ? planNames[planKey] : undefined;

  return (
    <AuthCard
      title="Create your workspace"
      description="Start on the Free plan. Your workspace, profile, and usage limits are created immediately."
      footer={
        <p className="text-center">
          Already have an account?{" "}
          <Link href="/login" className="font-semibold text-brand hover:text-brand-dark">
            Sign in
          </Link>
        </p>
      }
    >
      <SignupForm plan={planName} />
    </AuthCard>
  );
}
