import type { LucideIcon } from "lucide-react";
import {
  Building2,
  CalendarClock,
  Gauge,
  Mail,
  Radar,
  Search,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";

const ICONS: Record<string, LucideIcon> = {
  search: Search,
  "building-2": Building2,
  gauge: Gauge,
  mail: Mail,
  "calendar-clock": CalendarClock,
  radar: Radar,
};

export type AgentSummary = {
  key: string;
  name: string;
  slug: string;
  description: string;
  category: string;
  stage: string;
  icon: string;
  creditCost: number;
  requiresApproval: boolean;
};

export function AgentsGrid({ agents }: { agents: AgentSummary[] }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {agents.map((agent) => {
        const Icon = ICONS[agent.icon] ?? Search;
        return (
          <div
            key={agent.key}
            className="group flex flex-col rounded-2xl border border-line bg-surface p-5 shadow-soft transition-shadow hover:shadow-lift"
          >
            <div className="flex items-start justify-between gap-3">
              <span className="flex size-10 items-center justify-center rounded-xl bg-brand-soft text-brand-dark ring-1 ring-brand/10">
                <Icon className="size-5" aria-hidden="true" />
              </span>
              <Badge tone={agent.requiresApproval ? "warning" : "neutral"}>
                {agent.requiresApproval ? "Needs approval" : "Runs automatically"}
              </Badge>
            </div>
            <h3 className="mt-4 font-display text-base font-semibold text-ink">
              {agent.name}
            </h3>
            <p className="mt-1.5 flex-1 text-[13px] leading-relaxed text-muted">
              {agent.description}
            </p>
            <div className="mt-4 flex items-center justify-between border-t border-line pt-3 text-[11px] font-medium text-muted">
              <span>{agent.category}</span>
              <span>
                {agent.creditCost} run credit{agent.creditCost === 1 ? "" : "s"}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
