import Link from "next/link";
import { redirect } from "next/navigation";
import { LogOut } from "lucide-react";

import { OnboardingWizard } from "@/components/onboarding/onboarding-wizard";
import { Logo } from "@/components/ui/logo";
import { getSession } from "@/lib/auth/session";
import { getAuthContext } from "@/lib/auth/workspace";
import { logoutAction } from "@/server/actions/auth";

export const metadata = { title: "Set up your workspace" };

export default async function OnboardingPage() {
  const session = await getSession();
  if (!session) redirect("/login?next=/onboarding");

  const context = await getAuthContext();
  if (context?.workspace?.onboardedAt) redirect("/dashboard");

  const defaultCompanyName =
    context?.workspace?.profile?.companyName ?? context?.workspace?.name ?? "";

  return (
    <div className="min-h-screen bg-canvas">
      <header className="border-b border-line bg-surface">
        <div className="container-page flex h-16 items-center justify-between">
          <Logo />
          <div className="flex items-center gap-3">
            <span className="hidden text-xs text-muted sm:inline">
              Signed in as {session.user.email}
            </span>
            <form action={logoutAction}>
              <button
                type="submit"
                className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-muted hover:bg-ink/5 hover:text-ink"
              >
                <LogOut className="size-3.5" aria-hidden="true" />
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>

      <main className="container-page max-w-3xl py-10 sm:py-14">
        <div className="mb-8">
          <p className="eyebrow">Workspace setup</p>
          <h1 className="mt-2 text-3xl font-semibold text-ink sm:text-4xl">
            Let&apos;s give your agents the right context.
          </h1>
          <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted">
            Three short steps. This profile becomes the ground truth for research,
            qualification, and outreach — so be specific about who you do and do not serve.
          </p>
        </div>

        <OnboardingWizard defaultCompanyName={defaultCompanyName} />

        <p className="mt-8 text-center text-[11px] text-muted">
          Need help?{" "}
          <Link href="/features" className="underline underline-offset-2 hover:text-ink">
            Read how the agents use your profile
          </Link>
        </p>
      </main>
    </div>
  );
}
