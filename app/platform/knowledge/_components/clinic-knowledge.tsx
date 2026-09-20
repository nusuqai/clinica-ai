"use client";

import { useState } from "react";
import { ChevronDown, BookOpen } from "lucide-react";
import KnowledgeManager, { type KnowledgeDocView } from "./knowledge-manager";

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
      <button
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        <BookOpen className="h-4 w-4" />
        {open ? "إخفاء المستندات" : docs.length > 0 ? "إدارة المستندات" : "إضافة أول مستند"}
        <ChevronDown className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="mt-4 border-t border-border pt-4">
          <KnowledgeManager clinicId={clinicId} docs={docs} />
        </div>
      )}
    </div>
  );
}
