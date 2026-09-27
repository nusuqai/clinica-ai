"use client";

import { useState, useTransition } from "react";
import { Plus, Trash2 } from "lucide-react";
import { ProcedureKind } from "@prisma/client";
import { PROCEDURE_KIND_LABELS } from "@/lib/labels";
import type { TreatmentRecordPayload } from "@/server/actions/treatments";
import type { TreatmentRecordView } from "@/server/services/treatments";

// The clinical record form body — dates, narrative fields, procedure and
// prescription lines. Shared by the doctor's modal (per appointment) and the
// admin's modal (per patient); each wrapper decides where the record comes from
// and which action saves it. State is seeded from `initial` once, so a wrapper
// that swaps records must remount it (pass a `key`).

type ProcedureRow = TreatmentRecordPayload["procedures"][number];
type PrescriptionRow = TreatmentRecordPayload["prescriptions"][number];

const emptyProcedure = (): ProcedureRow => ({ kind: ProcedureKind.EXAMINATION, name: "" });
const emptyPrescription = (): PrescriptionRow => ({ drugName: "" });

/** A Date (or ISO string) as the "YYYY-MM-DD" an <input type="date"> wants. */
export function toDateInput(value: Date | string | null | undefined): string {
  if (!value) return "";
  return new Date(value).toISOString().slice(0, 10);
}

const inputClass =
  "w-full rounded-xl border border-border bg-background px-3 py-2 font-sans text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30";

interface RecordFormProps {
  /** The stored record when editing; null when creating. */
  initial: TreatmentRecordView | null;
  /** Visit date pre-filled on a new record. Defaults to today. */
  defaultVisitDate?: Date | string | null;
  /** Rendered above the dates — e.g. the admin's doctor/appointment pickers. */
  header?: React.ReactNode;
  onSubmit: (payload: TreatmentRecordPayload) => Promise<{ error?: string } | undefined>;
  onCancel: () => void;
}

export default function RecordForm({
  initial,
  defaultVisitDate,
  header,
  onSubmit,
  onCancel,
}: RecordFormProps) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [visitDate, setVisitDate] = useState(
    toDateInput(initial?.visitDate ?? defaultVisitDate) || toDateInput(new Date())
  );
  const [chiefComplaint, setChiefComplaint] = useState(initial?.chiefComplaint ?? "");
  const [diagnosis, setDiagnosis] = useState(initial?.diagnosis ?? "");
  const [clinicalNotes, setClinicalNotes] = useState(initial?.clinicalNotes ?? "");
  const [followUpDate, setFollowUpDate] = useState(toDateInput(initial?.followUpDate));
  const [procedures, setProcedures] = useState<ProcedureRow[]>(() =>
    initial?.procedures.length
      ? initial.procedures.map((p) => ({
          kind: p.kind,
          name: p.name,
          note: p.note ?? undefined,
          cost: p.cost ?? undefined,
        }))
      : [emptyProcedure()]
  );
  const [prescriptions, setPrescriptions] = useState<PrescriptionRow[]>(() =>
    initial?.prescriptions.length
      ? initial.prescriptions.map((p) => ({
          drugName: p.drugName,
          dose: p.dose ?? undefined,
          frequency: p.frequency ?? undefined,
          durationDays: p.durationDays?.toString() ?? undefined,
          instructions: p.instructions ?? undefined,
        }))
      : [emptyPrescription()]
  );

  function updateProcedure(i: number, patch: Partial<ProcedureRow>) {
    setProcedures((rows) => rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  }
  function updatePrescription(i: number, patch: Partial<PrescriptionRow>) {
    setPrescriptions((rows) => rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  }

  function handleSave() {
    setError(null);
    startTransition(async () => {
      const res = await onSubmit({
        visitDate,
        chiefComplaint,
        diagnosis,
        clinicalNotes,
        followUpDate: followUpDate || null,
        procedures,
        prescriptions,
      });
      if (res?.error) setError(res.error);
    });
  }

  return (
    <div className="space-y-6">
      {initial && (
        <p className="rounded-xl bg-amber-50 px-3 py-2 font-sans text-xs text-amber-800">
          أنت تعدّل سجلاً محفوظاً. سيتم حفظ نسخة من القيم السابقة في سجل التعديلات.
        </p>
      )}

      {header}

      {/* Dates */}
      <div className="grid gap-4 sm:grid-cols-2">
        <Labeled label="تاريخ الزيارة">
          <input
            type="date"
            value={visitDate}
            onChange={(e) => setVisitDate(e.target.value)}
            className={inputClass}
          />
        </Labeled>
        <Labeled label="موعد المتابعة (اختياري)">
          <input
            type="date"
            value={followUpDate}
            onChange={(e) => setFollowUpDate(e.target.value)}
            className={inputClass}
          />
        </Labeled>
      </div>

      <Labeled label="شكوى المريض">
        <textarea
          value={chiefComplaint}
          onChange={(e) => setChiefComplaint(e.target.value)}
          rows={2}
          placeholder="ما الذي يشكو منه المريض؟"
          className={`${inputClass} resize-none`}
        />
      </Labeled>
      <Labeled label="التشخيص">
        <textarea
          value={diagnosis}
          onChange={(e) => setDiagnosis(e.target.value)}
          rows={2}
          placeholder="التشخيص المبدئي أو النهائي..."
          className={`${inputClass} resize-none`}
        />
      </Labeled>
      <Labeled label="ملاحظات الطبيب">
        <textarea
          value={clinicalNotes}
          onChange={(e) => setClinicalNotes(e.target.value)}
          rows={4}
          placeholder="نتائج الفحص، الخطة العلاجية..."
          className={`${inputClass} resize-none`}
        />
      </Labeled>

      {/* Procedures */}
      <RowSection
        title="الإجراءات المُنفَّذة"
        onAdd={() => setProcedures((rows) => [...rows, emptyProcedure()])}
      >
        {procedures.map((row, i) => (
          <div key={i} className="rounded-xl border border-border p-3">
            <div className="flex gap-2">
              <select
                value={row.kind}
                onChange={(e) => updateProcedure(i, { kind: e.target.value as ProcedureKind })}
                className="rounded-xl border border-border bg-background px-2 py-2 font-sans text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
              >
                {Object.entries(PROCEDURE_KIND_LABELS).map(([val, label]) => (
                  <option key={val} value={val}>
                    {label}
                  </option>
                ))}
              </select>
              <input
                value={row.name}
                onChange={(e) => updateProcedure(i, { name: e.target.value })}
                placeholder="اسم الإجراء"
                className={`${inputClass} min-w-0 flex-1`}
              />
              <input
                value={row.cost ?? ""}
                onChange={(e) => updateProcedure(i, { cost: e.target.value })}
                inputMode="decimal"
                placeholder="التكلفة"
                dir="ltr"
                className={`${inputClass} !w-24`}
              />
              <RemoveButton
                onClick={() => setProcedures((rows) => rows.filter((_, j) => j !== i))}
              />
            </div>
            <input
              value={row.note ?? ""}
              onChange={(e) => updateProcedure(i, { note: e.target.value })}
              placeholder="ملاحظة (اختياري)"
              className={`${inputClass} mt-2`}
            />
          </div>
        ))}
      </RowSection>

      {/* Prescriptions */}
      <RowSection
        title="الروشتة"
        onAdd={() => setPrescriptions((rows) => [...rows, emptyPrescription()])}
      >
        {prescriptions.map((row, i) => (
          <div key={i} className="rounded-xl border border-border p-3">
            <div className="flex gap-2">
              <input
                value={row.drugName}
                onChange={(e) => updatePrescription(i, { drugName: e.target.value })}
                placeholder="اسم الدواء"
                className={`${inputClass} min-w-0 flex-1`}
              />
              <RemoveButton
                onClick={() => setPrescriptions((rows) => rows.filter((_, j) => j !== i))}
              />
            </div>
            <div className="mt-2 grid gap-2 sm:grid-cols-3">
              <input
                value={row.dose ?? ""}
                onChange={(e) => updatePrescription(i, { dose: e.target.value })}
                placeholder="الجرعة (500 مجم)"
                className={inputClass}
              />
              <input
                value={row.frequency ?? ""}
                onChange={(e) => updatePrescription(i, { frequency: e.target.value })}
                placeholder="التكرار (مرتين يومياً)"
                className={inputClass}
              />
              <input
                value={row.durationDays ?? ""}
                onChange={(e) => updatePrescription(i, { durationDays: e.target.value })}
                inputMode="numeric"
                placeholder="المدة (أيام)"
                className={inputClass}
              />
            </div>
            <input
              value={row.instructions ?? ""}
              onChange={(e) => updatePrescription(i, { instructions: e.target.value })}
              placeholder="تعليمات (بعد الأكل...)"
              className={`${inputClass} mt-2`}
            />
          </div>
        ))}
      </RowSection>

      {error && <p className="font-sans text-sm text-red-600">{error}</p>}

      <div className="flex gap-3">
        <button
          onClick={handleSave}
          disabled={isPending}
          className="flex-1 rounded-xl bg-primary py-2.5 font-sans text-sm font-medium text-white transition-colors hover:bg-primary/90 disabled:opacity-60"
        >
          {isPending ? "جارٍ الحفظ..." : initial ? "حفظ التعديلات" : "حفظ السجل"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-xl border border-border px-4 font-sans text-sm font-medium text-foreground transition-colors hover:bg-muted"
        >
          إلغاء
        </button>
      </div>
    </div>
  );
}

// ─── Primitives ───────────────────────────────────────────────────────────────

export function Labeled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="font-sans text-sm font-medium text-foreground">{label}</label>
      {children}
    </div>
  );
}

function RowSection({
  title,
  onAdd,
  children,
}: {
  title: string;
  onAdd: () => void;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="font-sans text-sm font-medium text-foreground">{title}</h3>
        <button
          type="button"
          onClick={onAdd}
          className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1 font-sans text-xs font-medium text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground"
        >
          <Plus className="h-3.5 w-3.5" />
          إضافة
        </button>
      </div>
      <div className="space-y-2">{children}</div>
    </section>
  );
}

function RemoveButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title="حذف"
      className="flex-shrink-0 rounded-lg border border-border px-2 text-muted-foreground transition-colors hover:border-red-200 hover:bg-red-50 hover:text-red-600"
    >
      <Trash2 className="h-4 w-4" />
    </button>
  );
}
