"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, CalendarCheck, CalendarPlus, ChevronDown, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

// Expandable "past visits" / "treatment record" panels on the clinic home page.
// The panel bodies are rendered on the server and handed in as nodes; this
// component only owns which one is open. One panel at a time, opening inline
// below the toggles — the patient never leaves the home page to look back at
// their history.

type PanelId = "visits" | "records";

interface PatientHistoryPanelsProps {
  completedCount: number;
  recordCount: number;
  totalCount: number;
  pastVisits: React.ReactNode;
  records: React.ReactNode;
}

export function PatientHistoryPanels({
  completedCount,
  recordCount,
  totalCount,
  pastVisits,
  records,
}: PatientHistoryPanelsProps) {
  const [open, setOpen] = useState<PanelId | null>(null);
  const toggle = (id: PanelId) => setOpen((cur) => (cur === id ? null : id));

  return (
    <div className="mt-8">
      <div className="grid gap-3 sm:grid-cols-3">
        <PanelToggle
          id="visits"
          open={open === "visits"}
          onToggle={toggle}
          icon={CalendarCheck}
          label="زياراتي السابقة"
          hint={`${completedCount} زيارة مكتملة`}
        />
        <PanelToggle
          id="records"
          open={open === "records"}
          onToggle={toggle}
          icon={FileText}
          label="سجلي العلاجي"
          hint={recordCount === 0 ? "التشخيص والروشتات" : `${recordCount} زيارة مسجّلة`}
        />
        <Card
          asChild
          className="group flex items-center gap-3 p-4 text-start transition-colors hover:border-primary/40 hover:bg-primary/5"
        >
          <Link href="#book">
            <IconTile icon={CalendarPlus} active={false} />
            <div className="min-w-0">
              <p className="font-sans text-sm font-medium text-foreground">احجز موعداً جديداً</p>
              <p className="font-sans text-xs text-muted-foreground">{totalCount} موعد إجمالاً</p>
            </div>
            <ArrowLeft className="ms-auto h-4 w-4 text-muted-foreground transition-colors group-hover:text-primary" />
          </Link>
        </Card>
      </div>

      {/* The open panel, directly under the toggles */}
      {open && (
        <Card id={`panel-${open}`} role="region" className="mt-4 p-4 sm:p-6">
          {open === "visits" ? pastVisits : records}
        </Card>
      )}
    </div>
  );
}

function PanelToggle({
  id,
  open,
  onToggle,
  icon,
  label,
  hint,
}: {
  id: PanelId;
  open: boolean;
  onToggle: (id: PanelId) => void;
  icon: React.ElementType;
  label: string;
  hint: string;
}) {
  return (
    <Button
      type="button"
      variant="outline"
      onClick={() => onToggle(id)}
      aria-expanded={open}
      aria-controls={`panel-${id}`}
      className={[
        "group h-auto justify-start gap-3 whitespace-normal rounded-2xl p-4 text-start font-normal [&_svg]:size-auto",
        open
          ? "border-primary/50 bg-primary/5 ring-1 ring-primary/20"
          : "border-border bg-card hover:border-primary/40 hover:bg-primary/5",
      ].join(" ")}
    >
      <IconTile icon={icon} active={open} />
      <div className="min-w-0">
        <p className="font-sans text-sm font-medium text-foreground">{label}</p>
        <p className="font-sans text-xs text-muted-foreground">{hint}</p>
      </div>
      <ChevronDown
        className={[
          "ms-auto h-4 w-4 transition-transform",
          open ? "rotate-180 text-primary" : "text-muted-foreground group-hover:text-primary",
        ].join(" ")}
      />
    </Button>
  );
}

function IconTile({ icon: Icon, active }: { icon: React.ElementType; active: boolean }) {
  return (
    <div
      className={[
        "flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl transition-colors",
        active
          ? "bg-primary text-white"
          : "bg-muted text-muted-foreground group-hover:bg-primary/10 group-hover:text-primary",
      ].join(" ")}
    >
      <Icon className="h-5 w-5" />
    </div>
  );
}
