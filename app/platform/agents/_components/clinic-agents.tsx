"use client";

import { useState } from "react";
import { Bot, ChevronDown } from "lucide-react";
import AgentsManager, { type AiAgentView } from "./agents-manager";

interface Props {
  clinicId: string;
  agents: AiAgentView[];
}

/**
 * One clinic's AI employees on the platform console. Collapsed by default: the
 * page lists every clinic, and each manager renders a full agent list.
 */
export default function ClinicAgents({ clinicId, agents }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <div>
      <button
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        <Bot className="h-4 w-4" />
        {open
          ? "إخفاء الموظفين"
          : agents.length > 0
            ? `إدارة الموظفين (${agents.length})`
            : "إضافة أول موظف آلي"}
        <ChevronDown className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="mt-4 border-t border-border pt-4">
          <AgentsManager clinicId={clinicId} agents={agents} />
        </div>
      )}
    </div>
  );
}
