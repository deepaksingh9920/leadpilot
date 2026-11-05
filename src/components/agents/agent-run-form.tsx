"use client";

import { useActionState } from "react";
import { Play } from "lucide-react";

import { SubmitButton } from "@/components/ui/submit-button";
import { Field, FormMessage, Select, TextInput, Textarea } from "@/components/ui/form";
import type { AgentInputProperty } from "@/lib/agents/input-schema";
import { initialFormState } from "@/lib/form";
import { runAgentAction } from "@/server/actions/agents";

export function AgentRunForm({
  agentKey,
  properties,
}: {
  agentKey: string;
  properties: AgentInputProperty[];
}) {
  const [state, formAction] = useActionState(runAgentAction, initialFormState);

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="agentKey" value={agentKey} />

      {properties.length === 0 ? (
        <p className="text-sm text-muted">
          This agent takes no input. It uses the business profile and leads already stored in this
          workspace.
        </p>
      ) : (
        properties.map((property) => {
          const error = state.fieldErrors?.[property.name]?.[0];
          const label = property.name
            .replace(/([A-Z])/g, " $1")
            .replace(/^./, (char) => char.toUpperCase());
          return (
            <Field
              key={property.name}
              label={label + (property.required ? " *" : "")}
              htmlFor={`field-${agentKey}-${property.name}`}
              hint={property.description}
              error={error}
            >
              {property.type === "array" ? (
                <Textarea
                  id={`field-${agentKey}-${property.name}`}
                  name={property.name}
                  placeholder="Paste IDs separated by commas"
                  className="min-h-20"
                  required={property.required}
                />
              ) : property.enum ? (
                <Select
                  id={`field-${agentKey}-${property.name}`}
                  name={property.name}
                  defaultValue=""
                  required={property.required}
                >
                  <option value="">Choose…</option>
                  {property.enum.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </Select>
              ) : (
                <TextInput
                  id={`field-${agentKey}-${property.name}`}
                  name={property.name}
                  type={property.type === "integer" ? "number" : "text"}
                  min={property.minimum}
                  max={property.maximum}
                  required={property.required}
                />
              )}
            </Field>
          );
        })
      )}

      <SubmitButton pendingLabel="Queueing…">
        <Play className="size-4" aria-hidden="true" />
        Queue run
      </SubmitButton>

      <FormMessage status={state.status} message={state.message} />
    </form>
  );
}
