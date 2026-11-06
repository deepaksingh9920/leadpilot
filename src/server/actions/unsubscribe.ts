"use server";

import { formString, type FormState } from "@/lib/form";
import { unsubscribeWithToken } from "@/server/services/unsubscribe";

/**
 * Public action used by the unsubscribe page. It deliberately requires no
 * session: the signed token is the authorization, and it is checked against the
 * message hash recorded at send time.
 */
export async function confirmUnsubscribeAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const token = formString(formData, "token");
  if (!token) {
    return { status: "error", message: "This unsubscribe link is missing its token." };
  }

  const result = await unsubscribeWithToken(token);
  if (!result.ok) return { status: "error", message: result.message };

  return {
    status: "success",
    message: result.alreadySuppressed
      ? `${result.email} was already suppressed. You will not receive further messages.`
      : `${result.email} has been added to the suppression list. You will not receive further messages.`,
  };
}
