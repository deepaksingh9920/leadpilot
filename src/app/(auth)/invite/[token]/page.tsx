import Link from "next/link";

import { AuthCard } from "@/components/auth/auth-card";
import {
  AcceptInviteForm,
  InviteRegistrationForm,
} from "@/components/auth/invite-forms";
import { Alert } from "@/components/ui/alert";
import { buttonClasses } from "@/components/ui/button";
import { getSession } from "@/lib/auth/session";
import { formatDate } from "@/lib/utils";
import { getInvitePreview } from "@/server/services/team";

export const metadata = { title: "Join your team" };

const ROLE_LABELS: Record<string, string> = {
  ADMIN: "an admin",
  MEMBER: "a member",
  VIEWER: "a viewer",
};

export default async function InvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const preview = await getInvitePreview(token);

  if (!preview.ok) {
    return (
      <AuthCard
        title="Invitation unavailable"
        description="This link cannot be used to join a workspace."
        footer={
          <p className="text-center">
            <Link href="/login" className="font-semibold text-brand hover:text-brand-dark">
              Go to sign in
            </Link>
          </p>
        }
      >
        <Alert tone="warning">{preview.message}</Alert>
      </AuthCard>
    );
  }

  const session = await getSession();
  const roleLabel = ROLE_LABELS[preview.role] ?? "a teammate";
  const invitePath = `/invite/${token}`;
  const description = (
    <>
      <strong className="font-semibold text-ink">{preview.inviterName}</strong> invited{" "}
      <strong className="font-semibold text-ink">{preview.email}</strong> to join{" "}
      <strong className="font-semibold text-ink">{preview.workspaceName}</strong> as{" "}
      {roleLabel}. This invitation expires {formatDate(preview.expiresAt)}.
    </>
  );

  if (session) {
    const sameAccount = session.user.email.toLowerCase() === preview.email;

    if (!sameAccount) {
      return (
        <AuthCard
          title={`Join ${preview.workspaceName}`}
          description={description}
          footer={
            <p className="text-center">
              <Link
                href="/dashboard"
                className="font-semibold text-brand hover:text-brand-dark"
              >
                Back to dashboard
              </Link>
            </p>
          }
        >
          <Alert tone="warning">
            You are signed in as {session.user.email}. Sign in with {preview.email} to accept
            this invitation.
          </Alert>
        </AuthCard>
      );
    }

    return (
      <AuthCard
        title={`Join ${preview.workspaceName}`}
        description={description}
        footer={
          <p className="text-center">
            You can switch between workspaces from the sidebar after joining.
          </p>
        }
      >
        <AcceptInviteForm token={token} />
      </AuthCard>
    );
  }

  if (preview.hasAccount) {
    return (
      <AuthCard
        title={`Join ${preview.workspaceName}`}
        description={description}
        footer={
          <p className="text-center">
            Not {preview.email}? Ask a workspace admin to send the invitation to the right
            address.
          </p>
        }
      >
        <div className="space-y-3">
          <Alert tone="info">
            An account already exists for {preview.email}. Sign in to accept the invitation.
          </Alert>
          <Link
            href={`/login?next=${encodeURIComponent(invitePath)}`}
            className={buttonClasses({ className: "w-full" })}
          >
            Sign in to accept
          </Link>
        </div>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title={`Join ${preview.workspaceName}`}
      description={description}
      footer={
        <p className="text-center">
          Already have an account?{" "}
          <Link
            href={`/login?next=${encodeURIComponent(invitePath)}`}
            className="font-semibold text-brand hover:text-brand-dark"
          >
            Sign in instead
          </Link>
        </p>
      }
    >
      <InviteRegistrationForm token={token} />
    </AuthCard>
  );
}
