"use client";

import { useActionState } from "react";

import { resendVerificationFormAction } from "@/server/actions/auth";
import { initialFormState } from "@/lib/form";

export function ResendVerificationButton() {
  const [state, action] = useActionState(resendVerificationFormAction, initialFormState);

  return (
    <form action={action}>
      <button
        type="submit"
        disabled={state.status === "success"}
        className="rounded-lg bg-amber-400/20 px-2.5 py-1 text-[11px] font-bold text-amber-900 ring-1 ring-amber-500/30 hover:bg-amber-400/30 disabled:opacity-60"
      >
        {state.status === "success" ? "Email sent" : "Resend verification"}
      </button>
    </form>
  );
}
