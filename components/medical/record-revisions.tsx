"use client";

import { useState } from "react";
import { History, Loader2, ArrowLeft } from "lucide-react";
import Modal from "@/components/admin/modal";
import { Badge } from "@/components/ui/badge";
import { getRecordRevisionsAction } from "@/server/actions/treatments";
import { PROCEDURE_KIND_LABELS } from "@/lib/labels";
import type { ProcedureKind } from "@prisma/client";
import type { TreatmentRecordView } from "@/server/services/treatments";
import { Alert } from "@/components/ui/alert";
import { Hint } from "@/components/ui/tooltip";

// The edit history of one treatment record, opened from its "عُدّل" badge on the
// admin timeline. Rather than just a count, it shows WHAT each edit changed:
// every stored revision is a snapshot of the record BEFORE that edit, so pairing
// each snapshot with the next one (and the last with the current record) yields a
// field-by-field "before → after" diff per edit. Loaded on demand.

interface Proc {
  kind: ProcedureKind;
  name: string;
  note: string | null;
  cost: string | null;
}
interface Presc {
  drugName: string;
  dose: string | null;
  frequency: string | null;
  durationDays: number | null;
  instructions: string | null;
}
interface Snapshot {
  visitDate?: string | null;
  chiefComplaint?: string | null;
  diagnosis?: string | null;
  clinicalNotes?: string | null;
  followUpDate?: string | null;
  procedures?: Proc[];
  prescriptions?: Presc[];
}

interface Revision {
  id: string;
  editedAt: string | Date;
  editedByName: string;
  snapshot: Snapshot;
}

/** A single field's change within one edit. */
type Change =
  | { kind: "text"; label: string; before: string; after: string }
  | { kind: "list"; label: string; added: string[]; removed: string[] };

function formatDateTime(value: string | Date): string {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("ar-EG", { dateStyle: "medium", timeStyle: "short" });
}

function formatDateOnly(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("ar-EG", { dateStyle: "medium" });
}

function procLine(p: Proc): string {
  return [
    `${PROCEDURE_KIND_LABELS[p.kind] ?? p.kind}: ${p.name}`,
    p.note ? `— ${p.note}` : "",
    p.cost ? `(${p.cost})` : "",
  ]
    .filter(Boolean)
    .join(" ");
}

function prescLine(p: Presc): string {
  const dose = [p.dose, p.frequency, p.durationDays ? `لمدة ${p.durationDays} يوم` : null]
    .filter(Boolean)
    .join(" · ");
  return [p.drugName, dose ? `— ${dose}` : "", p.instructions ? `(${p.instructions})` : ""]
    .filter(Boolean)
    .join(" ");
}

/** The record's current state, shaped like a stored snapshot, so the most recent
 *  edit can be diffed against it. */
function currentSnapshot(record: TreatmentRecordView): Snapshot {
  return {
    visitDate: record.visitDate ? new Date(record.visitDate).toISOString() : null,
    chiefComplaint: record.chiefComplaint,
    diagnosis: record.diagnosis,
    clinicalNotes: record.clinicalNotes,
    followUpDate: record.followUpDate ? new Date(record.followUpDate).toISOString() : null,
    procedures: record.procedures.map((p) => ({
      kind: p.kind,
      name: p.name,
      note: p.note,
      cost: p.cost,
    })),
    prescriptions: record.prescriptions.map((p) => ({
      drugName: p.drugName,
      dose: p.dose,
      frequency: p.frequency,
      durationDays: p.durationDays,
      instructions: p.instructions,
    })),
  };
}

function textChange(
  label: string,
  before: string | null | undefined,
  after: string | null | undefined,
  changes: Change[]
) {
  const b = (before ?? "").trim();
  const a = (after ?? "").trim();
  if (b !== a) changes.push({ kind: "text", label, before: b || "—", after: a || "—" });
}

function listChange(label: string, before: string[], after: string[], changes: Change[]) {
  const added = after.filter((x) => !before.includes(x));
  const removed = before.filter((x) => !after.includes(x));
  if (added.length || removed.length) changes.push({ kind: "list", label, added, removed });
}

/** Field-by-field difference between the record's state before and after one edit. */
function diff(before: Snapshot, after: Snapshot): Change[] {
  const changes: Change[] = [];
  textChange("الشكوى", before.chiefComplaint, after.chiefComplaint, changes);
  textChange("التشخيص", before.diagnosis, after.diagnosis, changes);
  textChange("ملاحظات الطبيب", before.clinicalNotes, after.clinicalNotes, changes);
  textChange(
    "موعد المتابعة",
    formatDateOnly(before.followUpDate),
    formatDateOnly(after.followUpDate),
    changes
  );
  // visitDate rarely changes, but surface it if it did.
  if ((before.visitDate ?? "") !== (after.visitDate ?? "")) {
    textChange(
      "تاريخ الزيارة",
      formatDateOnly(before.visitDate),
      formatDateOnly(after.visitDate),
      changes
    );
  }
  listChange(
    "الإجراءات",
    (before.procedures ?? []).map(procLine),
    (after.procedures ?? []).map(procLine),
    changes
  );
  listChange(
    "الروشتة",
    (before.prescriptions ?? []).map(prescLine),
    (after.prescriptions ?? []).map(prescLine),
    changes
  );
  return changes;
}

export default function RecordRevisions({ record }: { record: TreatmentRecordView }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [revisions, setRevisions] = useState<Revision[] | null>(null);

  const count = record.revisionCount;

  async function openHistory() {
    setOpen(true);
    if (revisions) return; // cached
    setLoading(true);
    setError(null);
    try {
      const res = await getRecordRevisionsAction(record.id);
      if ("error" in res && res.error) setError(res.error);
      else setRevisions((("revisions" in res ? res.revisions : []) as Revision[]) ?? []);
    } catch {
      setError("تعذّر تحميل سجل التعديلات");
    } finally {
      setLoading(false);
    }
  }

  // Build one entry per edit, newest first. Each stored revision holds the state
  // BEFORE that edit; the state AFTER is the next revision's snapshot, or — for
  // the most recent edit — the record's current state.
  const asc = revisions ?? [];
  const entries = asc
    .map((rev, i) => {
      const after = i < asc.length - 1 ? asc[i + 1].snapshot : currentSnapshot(record);
      return {
        id: rev.id,
        editedByName: rev.editedByName,
        editedAt: rev.editedAt,
        changes: diff(rev.snapshot, after),
      };
    })
    .reverse();

  return (
    <>
      <Hint label="عرض سجل التعديلات">
        <Badge asChild variant="warning" className="cursor-pointer gap-1 hover:bg-amber-200">
          <button type="button" onClick={openHistory}>
            <History className="h-3 w-3" />
            {count === 1 ? "تعديل واحد" : `${count} تعديلات`} — عرض التغييرات
          </button>
        </Badge>
      </Hint>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="سجل تعديلات السجل العلاجي"
        width="max-w-2xl"
      >
        <p className="mb-4 rounded-xl bg-muted/50 px-3 py-2 font-sans text-xs text-muted-foreground">
          كل بطاقة تُظهر ما تغيّر في تعديل واحد: القيمة السابقة ثم القيمة الجديدة — ومن قام بالتعديل
          ومتى، الأحدث أولاً.
        </p>

        {loading && (
          <div className="flex items-center justify-center gap-2 py-10 font-sans text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            جارٍ التحميل…
          </div>
        )}

        {error && (
          <Alert variant="destructive" className="block border-transparent px-3 py-2">
            {error}
          </Alert>
        )}

        {!loading && !error && entries.length === 0 && (
          <p className="py-8 text-center font-sans text-sm text-muted-foreground">
            لا توجد تعديلات على هذا السجل.
          </p>
        )}

        {!loading && !error && entries.length > 0 && (
          <ol className="space-y-4">
            {entries.map((entry, i) => (
              <li
                key={entry.id}
                className="overflow-hidden rounded-2xl border border-border bg-background"
              >
                <header className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-muted/30 px-4 py-2.5">
                  <span className="font-sans text-sm font-medium text-foreground">
                    تعديل #{entries.length - i}
                  </span>
                  <span className="font-sans text-xs text-muted-foreground">
                    {entry.editedByName} · {formatDateTime(entry.editedAt)}
                  </span>
                </header>
                <div className="space-y-3 px-4 py-3">
                  {entry.changes.length === 0 ? (
                    <p className="font-sans text-xs text-muted-foreground">
                      لا تغييرات ظاهرة في هذا التعديل.
                    </p>
                  ) : (
                    entry.changes.map((c, idx) => <ChangeRow key={idx} change={c} />)
                  )}
                </div>
              </li>
            ))}
          </ol>
        )}
      </Modal>
    </>
  );
}

function ChangeRow({ change }: { change: Change }) {
  return (
    <div>
      <p className="mb-1 font-sans text-xs font-medium text-muted-foreground">{change.label}</p>
      {change.kind === "text" ? (
        <div className="flex flex-wrap items-center gap-2 font-sans text-sm">
          <span className="whitespace-pre-wrap rounded-lg bg-red-50 px-2 py-1 text-red-700 line-through decoration-red-300">
            {change.before}
          </span>
          <ArrowLeft className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />
          <span className="whitespace-pre-wrap rounded-lg bg-emerald-50 px-2 py-1 text-emerald-800">
            {change.after}
          </span>
        </div>
      ) : (
        <ul className="space-y-1 font-sans text-sm">
          {change.removed.map((x, i) => (
            <li
              key={`r-${i}`}
              className="rounded-lg bg-red-50 px-2 py-1 text-red-700 line-through decoration-red-300"
            >
              − {x}
            </li>
          ))}
          {change.added.map((x, i) => (
            <li key={`a-${i}`} className="rounded-lg bg-emerald-50 px-2 py-1 text-emerald-800">
              + {x}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
