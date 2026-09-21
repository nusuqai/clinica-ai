"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FileText, Plus, Trash2, Pencil } from "lucide-react";
import { ProcedureKind } from "@prisma/client";
import Modal from "@/components/admin/modal";
import { PROCEDURE_KIND_LABELS } from "@/lib/labels";
import {
  createRecordForAppointmentAction,
  getRecordForAppointmentAction,
  updateRecordAction,
  type TreatmentRecordPayload,
} from "@/server/actions/treatments";

// The doctor's write surface for a visit's clinical record. Opened from the
// appointment row; loads any existing record ON OPEN rather than having the
// table embed every record in every row.

type ProcedureRow = TreatmentRecordPayload["procedures"][number];
type PrescriptionRow = TreatmentRecordPayload["prescriptions"][number];

const emptyProcedure = (): ProcedureRow => ({ kind: ProcedureKind.EXAMINATION, name: "" });
const emptyPrescription = (): PrescriptionRow => ({ drugName: "" });

/** A Date (or ISO string) as the "YYYY-MM-DD" an <input type="date"> wants. */
function toDateInput(value: Date | string | null | undefined): string {
  if (!value) return "";
  return new Date(value).toISOString().slice(0, 10);
}

interface RecordFormModalProps {
  appointmentId: string;
  patientName: string;
  /** The visit's own date, pre-filled on a new record. */
  defaultVisitDate: Date | string | null;
  /** True when a record already exists — changes the button to "edit". */
  hasRecord: boolean;
}

export default function RecordFormModal({
  appointmentId,
  patientName,
  defaultVisitDate,
  hasRecord,
}: RecordFormModalProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // null = creating; a string = editing that record.
  const [recordId, setRecordId] = useState<string | null>(null);
  const [visitDate, setVisitDate] = useState(
    toDateInput(defaultVisitDate) || toDateInput(new Date())
  );
  const [chiefComplaint, setChiefComplaint] = useState("");
  const [diagnosis, setDiagnosis] = useState("");
  const [clinicalNotes, setClinicalNotes] = useState("");
  const [followUpDate, setFollowUpDate] = useState("");
  const [procedures, setProcedures] = useState<ProcedureRow[]>([emptyProcedure()]);
  const [prescriptions, setPrescriptions] = useState<PrescriptionRow[]>([emptyPrescription()]);

  // Load the existing record when the modal opens, so the form edits what is
  // actually stored rather than a stale copy captured at render time.
  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const res = await getRecordForAppointmentAction(appointmentId);
    setLoading(false);

    if ("error" in res && res.error) {
      setError(res.error);
      return;
    }
    const record = "record" in res ? res.record : null;
    if (!record) {
      setRecordId(null);
      return;
    }

    setRecordId(record.id);
    setVisitDate(toDateInput(record.visitDate));
    setChiefComplaint(record.chiefComplaint ?? "");
    setDiagnosis(record.diagnosis ?? "");
    setClinicalNotes(record.clinicalNotes ?? "");
    setFollowUpDate(toDateInput(record.followUpDate));
    setProcedures(
      record.procedures.length > 0
        ? record.procedures.map((p) => ({
            kind: p.kind,
            name: p.name,
            note: p.note ?? undefined,
            cost: p.cost ?? undefined,
          }))
        : [emptyProcedure()]
    );
    setPrescriptions(
      record.prescriptions.length > 0
        ? record.prescriptions.map((p) => ({
            drugName: p.drugName,
            dose: p.dose ?? undefined,
            frequency: p.frequency ?? undefined,
            durationDays: p.durationDays?.toString() ?? undefined,
            instructions: p.instructions ?? undefined,
          }))
        : [emptyPrescription()]
    );
  }, [appointmentId]);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  function handleSave() {
    setError(null);
    const payload: TreatmentRecordPayload = {
      visitDate,
      chiefComplaint,
      diagnosis,
      clinicalNotes,
      followUpDate: followUpDate || null,
      procedures,
      prescriptions,
    };

    startTransition(async () => {
      const res = recordId
        ? await updateRecordAction(recordId, payload)
        : await createRecordForAppointmentAction(appointmentId, payload);

      if (res?.error) {
        setError(res.error);
        return;
      }
      setOpen(false);
      router.refresh();
    });
  }

  const busy = loading || isPending;

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        title={hasRecord ? "تعديل السجل العلاجي" : "إضافة سجل علاجي"}
        className={[
          "inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 font-sans text-xs font-medium transition-colors",
          hasRecord
            ? "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
            : "border-border text-muted-foreground hover:border-foreground/30 hover:text-foreground",
        ].join(" ")}
      >
        {hasRecord ? <Pencil className="h-3.5 w-3.5" /> : <FileText className="h-3.5 w-3.5" />}
        {hasRecord ? "السجل العلاجي" : "سجل علاجي"}
      </button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={`السجل العلاجي — ${patientName}`}
        width="max-w-3xl"
      >
        {loading ? (
          <p className="py-8 text-center font-sans text-sm text-muted-foreground">
            جارٍ تحميل السجل...
          </p>
        ) : (
          <div className="space-y-6">
            {recordId && (
              <p className="rounded-xl bg-amber-50 px-3 py-2 font-sans text-xs text-amber-800">
                أنت تعدّل سجلاً محفوظاً. سيتم حفظ نسخة من القيم السابقة في سجل التعديلات.
              </p>
            )}

            {/* Dates */}
            <div className="grid gap-4 sm:grid-cols-2">
              <LabeledInput
                label="تاريخ الزيارة"
                type="date"
                value={visitDate}
                onChange={setVisitDate}
              />
              <LabeledInput
                label="موعد المتابعة (اختياري)"
                type="date"
                value={followUpDate}
                onChange={setFollowUpDate}
              />
            </div>

            <LabeledTextarea
              label="شكوى المريض"
              value={chiefComplaint}
              onChange={setChiefComplaint}
              placeholder="ما الذي يشكو منه المريض؟"
              rows={2}
            />
            <LabeledTextarea
              label="التشخيص"
              value={diagnosis}
              onChange={setDiagnosis}
              placeholder="التشخيص المبدئي أو النهائي..."
              rows={2}
            />
            <LabeledTextarea
              label="ملاحظات الطبيب"
              value={clinicalNotes}
              onChange={setClinicalNotes}
              placeholder="نتائج الفحص، الخطة العلاجية..."
              rows={4}
            />

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
                      onChange={(e) =>
                        setProcedures((rows) =>
                          rows.map((r, j) =>
                            j === i ? { ...r, kind: e.target.value as ProcedureKind } : r
                          )
                        )
                      }
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
                      onChange={(e) =>
                        setProcedures((rows) =>
                          rows.map((r, j) => (j === i ? { ...r, name: e.target.value } : r))
                        )
                      }
                      placeholder="اسم الإجراء"
                      className="min-w-0 flex-1 rounded-xl border border-border bg-background px-3 py-2 font-sans text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                    />
                    <input
                      value={row.cost ?? ""}
                      onChange={(e) =>
                        setProcedures((rows) =>
                          rows.map((r, j) => (j === i ? { ...r, cost: e.target.value } : r))
                        )
                      }
                      inputMode="decimal"
                      placeholder="التكلفة"
                      dir="ltr"
                      className="w-24 rounded-xl border border-border bg-background px-3 py-2 font-sans text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                    />
                    <RemoveButton
                      onClick={() => setProcedures((rows) => rows.filter((_, j) => j !== i))}
                    />
                  </div>
                  <input
                    value={row.note ?? ""}
                    onChange={(e) =>
                      setProcedures((rows) =>
                        rows.map((r, j) => (j === i ? { ...r, note: e.target.value } : r))
                      )
                    }
                    placeholder="ملاحظة (اختياري)"
                    className="mt-2 w-full rounded-xl border border-border bg-background px-3 py-2 font-sans text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
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
                      onChange={(e) =>
                        setPrescriptions((rows) =>
                          rows.map((r, j) => (j === i ? { ...r, drugName: e.target.value } : r))
                        )
                      }
                      placeholder="اسم الدواء"
                      className="min-w-0 flex-1 rounded-xl border border-border bg-background px-3 py-2 font-sans text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                    />
                    <RemoveButton
                      onClick={() => setPrescriptions((rows) => rows.filter((_, j) => j !== i))}
                    />
                  </div>
                  <div className="mt-2 grid gap-2 sm:grid-cols-3">
                    <input
                      value={row.dose ?? ""}
                      onChange={(e) =>
                        setPrescriptions((rows) =>
                          rows.map((r, j) => (j === i ? { ...r, dose: e.target.value } : r))
                        )
                      }
                      placeholder="الجرعة (500 مجم)"
                      className="rounded-xl border border-border bg-background px-3 py-2 font-sans text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                    />
                    <input
                      value={row.frequency ?? ""}
                      onChange={(e) =>
                        setPrescriptions((rows) =>
                          rows.map((r, j) => (j === i ? { ...r, frequency: e.target.value } : r))
                        )
                      }
                      placeholder="التكرار (مرتين يومياً)"
                      className="rounded-xl border border-border bg-background px-3 py-2 font-sans text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                    />
                    <input
                      value={row.durationDays ?? ""}
                      onChange={(e) =>
                        setPrescriptions((rows) =>
                          rows.map((r, j) => (j === i ? { ...r, durationDays: e.target.value } : r))
                        )
                      }
                      inputMode="numeric"
                      placeholder="المدة (أيام)"
                      className="rounded-xl border border-border bg-background px-3 py-2 font-sans text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                    />
                  </div>
                  <input
                    value={row.instructions ?? ""}
                    onChange={(e) =>
                      setPrescriptions((rows) =>
                        rows.map((r, j) => (j === i ? { ...r, instructions: e.target.value } : r))
                      )
                    }
                    placeholder="تعليمات (بعد الأكل...)"
                    className="mt-2 w-full rounded-xl border border-border bg-background px-3 py-2 font-sans text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                  />
                </div>
              ))}
            </RowSection>

            {error && <p className="font-sans text-sm text-red-600">{error}</p>}

            <div className="flex gap-3">
              <button
                onClick={handleSave}
                disabled={busy}
                className="flex-1 rounded-xl bg-primary py-2.5 font-sans text-sm font-medium text-white transition-colors hover:bg-primary/90 disabled:opacity-60"
              >
                {isPending ? "جارٍ الحفظ..." : recordId ? "حفظ التعديلات" : "حفظ السجل"}
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-xl border border-border px-4 font-sans text-sm font-medium text-foreground transition-colors hover:bg-muted"
              >
                إلغاء
              </button>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}

// ─── Form primitives ──────────────────────────────────────────────────────────

function LabeledInput({
  label,
  type = "text",
  value,
  onChange,
}: {
  label: string;
  type?: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      <label className="font-sans text-sm font-medium text-foreground">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-xl border border-border bg-background px-3 py-2 font-sans text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
      />
    </div>
  );
}

function LabeledTextarea({
  label,
  value,
  onChange,
  placeholder,
  rows = 3,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  rows?: number;
}) {
  return (
    <div className="space-y-1.5">
      <label className="font-sans text-sm font-medium text-foreground">{label}</label>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={rows}
        placeholder={placeholder}
        className="w-full resize-none rounded-xl border border-border bg-background px-3 py-2 font-sans text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
      />
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
