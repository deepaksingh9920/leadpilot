import { Alert } from "@/components/ui/alert";
import { Card } from "@/components/ui/card";
import { Logo } from "@/components/ui/logo";
import { UnsubscribeConfirmForm } from "@/components/unsubscribe/unsubscribe-confirm";
import { getUnsubscribePreview } from "@/server/services/unsubscribe";

export const metadata = {
  title: "Unsubscribe",
  robots: { index: false, follow: false },
};

export default async function UnsubscribePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const preview = await getUnsubscribePreview(token);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-canvas px-5 py-10">
      <div className="w-full max-w-md">
        <div className="flex justify-center">
          <Logo />
        </div>

        <Card className="mt-6 p-6">
          {preview.ok ? (
            <>
              <h1 className="font-display text-xl font-semibold text-ink">
                Unsubscribe from {preview.workspaceName}
              </h1>
              <p className="mt-2 text-sm leading-relaxed text-muted">
                This link is for <span className="font-medium text-ink">{preview.maskedEmail}</span>.
                Confirm below and this address will be added to the workspace&apos;s suppression
                list. You will not receive further outreach from them.
              </p>

              <div className="mt-4 space-y-3">
                {preview.alreadySuppressed ? (
                  <Alert tone="info">
                    This address is already suppressed. Confirming again will not change anything.
                  </Alert>
                ) : null}
                <UnsubscribeConfirmForm
                  token={token}
                  alreadySuppressed={preview.alreadySuppressed}
                />
              </div>
            </>
          ) : (
            <>
              <h1 className="font-display text-xl font-semibold text-ink">
                This link is not valid
              </h1>
              <p className="mt-2 text-sm leading-relaxed text-muted">{preview.message}</p>
              <p className="mt-4 text-[12px] leading-relaxed text-muted">
                If you continue to receive messages, reply to the sender directly and ask to be
                removed.
              </p>
            </>
          )}
        </Card>

        <p className="mt-5 text-center text-[11px] leading-relaxed text-muted">
          LeadPilot processes unsubscribe requests without requiring an account. The signed link is
          bound to one message and recipient.
        </p>
      </div>
    </div>
  );
}
