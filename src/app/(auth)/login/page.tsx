import Link from "next/link";
import { redirect } from "next/navigation";

import { AuthCard } from "@/components/auth/auth-card";
import { LoginForm } from "@/components/auth/login-form";
import { Alert } from "@/components/ui/alert";
import { getSession } from "@/lib/auth/session";
import { safeNextPath } from "@/lib/validation/auth";

export const metadata = { title: "Sign in" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await getSession();
  const params = await searchParams;
  if (session) redirect("/dashboard");

  const nextParam = typeof params.next === "string" ? params.next : undefined;
  const resetDone = params.reset === "1";
  const verified = params.verified === "1";
  const workspaceDeleted = params.deleted === "1";
  const accountDeleted = params.account === "deleted";

  return (
    <AuthCard
      title="Welcome back"
      description="Sign in to your workspace to review leads, agents, and drafts."
      footer={
        <p className="text-center">
          New to LeadPilot?{" "}
          <Link href="/signup" className="font-semibold text-brand hover:text-brand-dark">
            Create a free workspace
          </Link>
        </p>
      }
    >
      <div className="space-y-4">
        {resetDone ? (
          <Alert tone="success">
            Your password was updated. Sign in with your new password.
          </Alert>
        ) : null}
        {verified ? (
          <Alert tone="success">Email verified. You can sign in now.</Alert>
        ) : null}
        {workspaceDeleted ? (
          <Alert tone="info">
            The workspace was deleted and your session ended. Data is permanently purged after
            the 30-day grace period.
          </Alert>
        ) : null}
        {accountDeleted ? (
          <Alert tone="info">
            Your account is closed and you have been signed out. Workspace records you created
            remain with their workspaces under &ldquo;Deleted user&rdquo;.
          </Alert>
        ) : null}
        <LoginForm next={nextParam ? safeNextPath(nextParam) : undefined} />
      </div>
    </AuthCard>
  );
}
