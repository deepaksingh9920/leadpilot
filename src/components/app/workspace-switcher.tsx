"use client";

import { useRef } from "react";

import { switchWorkspaceAction } from "@/server/actions/settings";

export function WorkspaceSwitcher({
  workspaces,
  activeId,
}: {
  workspaces: { id: string; name: string }[];
  activeId: string;
}) {
  const formRef = useRef<HTMLFormElement>(null);

  if (workspaces.length <= 1) {
    return (
      <div className="rounded-xl border border-line bg-canvas/60 px-3 py-2.5">
        <p className="truncate text-sm font-semibold text-ink">
          {workspaces[0]?.name ?? "Workspace"}
        </p>
        <p className="text-[11px] text-muted">Active workspace</p>
      </div>
    );
  }

  return (
    <form ref={formRef} action={switchWorkspaceAction}>
      <label htmlFor="workspaceId" className="sr-only">
        Switch workspace
      </label>
      <select
        id="workspaceId"
        name="workspaceId"
        defaultValue={activeId}
        onChange={() => formRef.current?.requestSubmit()}
        className="w-full rounded-xl border border-line bg-canvas/60 px-3 py-2.5 text-sm font-semibold text-ink outline-none focus:border-brand"
      >
        {workspaces.map((workspace) => (
          <option key={workspace.id} value={workspace.id}>
            {workspace.name}
          </option>
        ))}
      </select>
      <noscript>
        <button type="submit" className="mt-1 text-xs font-semibold text-brand">
          Switch
        </button>
      </noscript>
    </form>
  );
}
