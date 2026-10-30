import { requireWorkspace } from "@/lib/auth/workspace";
import { env } from "@/lib/env";
import { Sidebar } from "@/components/app/sidebar";
import { Topbar } from "@/components/app/topbar";
import { ResendVerificationButton } from "@/components/app/resend-verification-button";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const context = await requireWorkspace();
  const { workspace, user, plan, role } = context;

  if (!workspace) return null;

  const planName = plan?.name ?? "Free";
  const workspaces = context.memberships.map((membership) => ({
    id: membership.workspaceId,
    name: membership.workspace.name,
  }));

  return (
    <div className="min-h-screen bg-canvas">
      <Sidebar
        user={{ name: user.name, email: user.email }}
        workspace={{ id: workspace.id, name: workspace.name }}
        workspaces={workspaces}
        planName={planName}
        role={role ?? "MEMBER"}
        isSuperAdmin={user.isSuperAdmin}
      />

      <div className="lg:pl-[260px]">
        <Topbar
          workspaceName={workspace.name}
          planName={planName}
          isSuperAdmin={user.isSuperAdmin}
        />

        {!user.emailVerifiedAt ? (
          <div className="border-b border-warning/20 bg-warning-soft">
            <div className="flex flex-col gap-2 px-4 py-2.5 text-xs text-warning sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
              <p>
                <span className="font-semibold">Your email is not verified.</span>{" "}
                {env.emailConfigured
                  ? "Verify it to secure account recovery."
                  : "Email delivery is not configured in this environment yet, so verification cannot be sent."}
              </p>
              {env.emailConfigured ? <ResendVerificationButton /> : null}
            </div>
          </div>
        ) : null}

        <main className="mx-auto w-full max-w-[1400px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          {children}
        </main>
      </div>
    </div>
  );
}
