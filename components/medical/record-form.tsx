"use client";

import { useState, useTransition } from "react";
import { Plus, Trash2 } from "lucide-react";
import { ProcedureKind } from "@prisma/client";
import { PROCEDURE_KIND_LABELS } from "@/lib/labels";
import type { TreatmentRecordPayload } from "@/server/actions/treatments";
import type { TreatmentRecordView } from "@/server/services/treatments";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Label } from "@/components/ui/label";
import { Alert } from "@/components/ui/alert";
import { Hint } from "@/components/ui/tooltip";

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

const PROCEDURE_KIND_OPTIONS = Object.entries(PROCEDURE_KIND_LABELS).map(([value, label]) => ({
  value,
  label,
}));

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
        <Alert
          variant="warning"
          className="block border-transparent px-3 py-2 text-xs text-amber-800"
        >
          أنت تعدّل سجلاً محفوظاً. سيتم حفظ نسخة من القيم السابقة في سجل التعديلات.
        </Alert>
      )}

      {header}

      {/* Dates */}
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField
          type="date"
          label="تاريخ الزيارة"
          value={visitDate}
          onValueChange={setVisitDate}
        />
        <FormField
          type="date"
          label="موعد المتابعة (اختياري)"
          value={followUpDate}
          onValueChange={setFollowUpDate}
        />
      </div>

      <FormField
        type="textarea"
        label="شكوى المريض"
        value={chiefComplaint}
        onValueChange={setChiefComplaint}
        rows={2}
        placeholder="ما الذي يشكو منه المريض؟"
      />
      <FormField
        type="textarea"
        label="التشخيص"
        value={diagnosis}
        onValueChange={setDiagnosis}
        rows={2}
        placeholder="التشخيص المبدئي أو النهائي..."
      />
      <FormField
        type="textarea"
        label="ملاحظات الطبيب"
        value={clinicalNotes}
        onValueChange={setClinicalNotes}
        rows={4}
        placeholder="نتائج الفحص، الخطة العلاجية..."
      />

      {/* Procedures */}
      <RowSection
        title="الإجراءات المُنفَّذة"
        onAdd={() => setProcedures((rows) => [...rows, emptyProcedure()])}
      >
        {procedures.map((row, i) => (
          <div key={i} className="rounded-xl border border-border p-3">
            <div className="flex gap-2">
              <FormField
                type="select"
                options={PROCEDURE_KIND_OPTIONS}
                value={row.kind}
                onValueChange={(v) => updateProcedure(i, { kind: v as ProcedureKind })}
                className="w-36 shrink-0"
              />
              <FormField
                value={row.name}
                onValueChange={(v) => updateProcedure(i, { name: v })}
                placeholder="اسم الإجراء"
                className="min-w-0 flex-1"
              />
              <FormField
                value={row.cost ?? ""}
                onValueChange={(v) => updateProcedure(i, { cost: v })}
                inputMode="decimal"
                placeholder="التكلفة"
                dir="ltr"
                className="w-24 shrink-0"
              />
              <RemoveButton
                onClick={() => setProcedures((rows) => rows.filter((_, j) => j !== i))}
              />
            </div>
            <FormField
              value={row.note ?? ""}
              onValueChange={(v) => updateProcedure(i, { note: v })}
              placeholder="ملاحظة (اختياري)"
              className="mt-2"
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
              <FormField
                value={row.drugName}
                onValueChange={(v) => updatePrescription(i, { drugName: v })}
                placeholder="اسم الدواء"
                className="min-w-0 flex-1"
              />
              <RemoveButton
                onClick={() => setPrescriptions((rows) => rows.filter((_, j) => j !== i))}
              />
            </div>
            <div className="mt-2 grid gap-2 sm:grid-cols-3">
              <FormField
                value={row.dose ?? ""}
                onValueChange={(v) => updatePrescription(i, { dose: v })}
                placeholder="الجرعة (500 مجم)"
              />
              <FormField
                value={row.frequency ?? ""}
                onValueChange={(v) => updatePrescription(i, { frequency: v })}
                placeholder="التكرار (مرتين يومياً)"
              />
              <FormField
                value={row.durationDays ?? ""}
                onValueChange={(v) => updatePrescription(i, { durationDays: v })}
                inputMode="numeric"
                placeholder="المدة (أيام)"
              />
            </div>
            <FormField
              value={row.instructions ?? ""}
              onValueChange={(v) => updatePrescription(i, { instructions: v })}
              placeholder="تعليمات (بعد الأكل...)"
              className="mt-2"
            />
          </div>
        ))}
      </RowSection>

      {error && <p className="font-sans text-sm text-red-600">{error}</p>}

      <div className="flex gap-3">
        <Button onClick={handleSave} loading={isPending} className="flex-1">
          {isPending ? "جارٍ الحفظ..." : initial ? "حفظ التعديلات" : "حفظ السجل"}
        </Button>
        <Button type="button" variant="outline" onClick={onCancel}>
          إلغاء
        </Button>
      </div>
    </div>
  );
}

// ─── Primitives ───────────────────────────────────────────────────────────────

export function Labeled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="font-sans text-sm font-medium text-foreground">{label}</Label>
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
        <Button type="button" variant="outline" size="sm" onClick={onAdd}>
          <Plus />
          إضافة
        </Button>
      </div>
      <div className="space-y-2">{children}</div>
    </section>
  );
}

function RemoveButton({ onClick }: { onClick: () => void }) {
  return (
    <Hint label="حذف">
      <Button
        aria-label="حذف"
        type="button"
        variant="ghost-destructive"
        size="icon"
        onClick={onClick}
        className="h-10 shrink-0 border border-border hover:border-red-200"
      >
        <Trash2 />
      </Button>
    </Hint>
  );
}
