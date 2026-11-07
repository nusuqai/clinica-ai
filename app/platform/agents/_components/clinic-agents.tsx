"use client";

import { useState } from "react";
import { Bot, ChevronDown } from "lucide-react";
import AgentsManager, { type AiAgentView } from "./agents-manager";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

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
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          <Bot />
          {open
            ? "إخفاء الموظفين"
            : agents.length > 0
              ? `إدارة الموظفين (${agents.length})`
              : "إضافة أول موظف آلي"}
          <ChevronDown className={`transition-transform ${open ? "rotate-180" : ""}`} />
        </Button>
      </CollapsibleTrigger>

      <CollapsibleContent className="mt-4 border-t border-border pt-4">
        <AgentsManager clinicId={clinicId} agents={agents} />
      </CollapsibleContent>
    </Collapsible>
  );
}
