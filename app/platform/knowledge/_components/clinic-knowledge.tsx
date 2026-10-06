"use client";

import { useState } from "react";
import { ChevronDown, BookOpen } from "lucide-react";
import KnowledgeManager, { type KnowledgeDocView } from "./knowledge-manager";
import { Button } from "@/components/ui/button";

interface Props {
  clinicId: string;
  docs: KnowledgeDocView[];
}

/**
 * One clinic's knowledge base on the platform console. Collapsed by default:
 * the page lists every clinic, and each manager renders a full document list.
 */
export default function ClinicKnowledge({ clinicId, docs }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <div>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setOpen((v) => !v)}
        className="text-sm text-muted-foreground hover:text-foreground"
      >
        <BookOpen />
        {open ? "إخفاء المستندات" : docs.length > 0 ? "إدارة المستندات" : "إضافة أول مستند"}
        <ChevronDown className={`transition-transform ${open ? "rotate-180" : ""}`} />
      </Button>

      {open && (
        <div className="mt-4 border-t border-border pt-4">
          <KnowledgeManager clinicId={clinicId} docs={docs} />
        </div>
      )}
    </div>
  );
}
