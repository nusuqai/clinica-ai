"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, Search, X } from "lucide-react";
import Modal from "@/components/admin/modal";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { createOperationAction, searchOperationPatientsAction } from "@/server/actions/operations";
import type { OperationFormOptions } from "@/server/services/operations";

type Patient = { id: string; fullName: string; phone: string | null };

const OTHER = "__other__";
const HOSPITAL = "__hospital__";

/**
 * Opens a new operation case. From the patient page the patient is fixed;
 * from the operations list the member searches for one. The date is set
 * afterwards, on the case page (scheduling checks the surgeon's day).
 */
export default function NewOperationButton({
  options,
  patient: fixedPatient,
  size = "default",
}: {
  options: OperationFormOptions;
  patient?: Patient;
  size?: "default" | "sm";
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const [patient, setPatient] = useState<Patient | null>(fixedPatient ?? null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Patient[]>([]);
  const [searching, setSearching] = useState(false);

  const [serviceId, setServiceId] = useState(options.services[0]?.id ?? OTHER);
  const [name, setName] = useState("");
  const [doctorId, setDoctorId] = useState(
    options.doctors.length === 1 ? options.doctors[0].id : ""
  );
  const [place, setPlace] = useState(options.branches.length === 1 ? options.branches[0].id : "");
  const [hospital, setHospital] = useState("");
  const [price, setPrice] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (fixedPatient || patient || !query.trim()) {
      setResults([]);
      return;
    }
    let cancelled = false;
    setSearching(true);
    const t = setTimeout(() => {
      searchOperationPatientsAction(query)
        .then((rows) => !cancelled && setResults(rows))
        .catch(() => !cancelled && setResults([]))
        .finally(() => !cancelled && setSearching(false));
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [query, patient, fixedPatient]);

  function reset() {
    setError(null);
    setPatient(fixedPatient ?? null);
    setQuery("");
    setServiceId(options.services[0]?.id ?? OTHER);
    setName("");
    setDoctorId(options.doctors.length === 1 ? options.doctors[0].id : "");
    setPlace(options.branches.length === 1 ? options.branches[0].id : "");
    setHospital("");
    setPrice("");
    setNotes("");
  }

  function submit() {
    setError(null);
    if (!patient) return setError("اختر المريض");
    if (serviceId === OTHER && !name.trim()) return setError("اكتب اسم العملية");
    if (place === HOSPITAL && !hospital.trim()) return setError("اكتب اسم المستشفى");
    const priceNum = price.trim() === "" ? null : Number(price);
    if (priceNum != null && (!Number.isFinite(priceNum) || priceNum < 0))
      return setError("التكلفة غير صالحة");
    startTransition(async () => {
      const res = await createOperationAction({
        patientId: patient.id,
        serviceId: serviceId === OTHER ? null : serviceId,
        name: serviceId === OTHER ? name : null,
        doctorId: doctorId || null,
        branchId: place && place !== HOSPITAL ? place : null,
        hospitalName: place === HOSPITAL ? hospital : null,
        price: priceNum,
        notes,
      });
      if (!res.ok) return setError(res.error);
      setOpen(false);
      if (res.id) router.push(`/admin/operations/${res.id}`);
      else router.refresh();
    });
  }

  const serviceOptions = [
    ...options.services.map((s) => ({ value: s.id, label: s.name })),
    { value: OTHER, label: "عملية أخرى (اكتب الاسم)" },
  ];
  const placeOptions = [
    ...options.branches.map((b) => ({ value: b.id, label: `فرع ${b.name}` })),
    { value: HOSPITAL, label: "مستشفى خارجي" },
  ];

  return (
    <>
      <Button
        size={size}
        onClick={() => {
          reset();
          setOpen(true);
        }}
      >
        <Plus />
        عملية جديدة
      </Button>

      <Modal open={open} onClose={() => setOpen(false)} title="عملية جديدة" width="max-w-xl">
        <div className="space-y-4">
          {error && <Alert variant="destructive">{error}</Alert>}

          {/* Patient */}
          {!fixedPatient && (
            <div>
              <p className="mb-1.5 font-sans text-sm font-medium text-muted-foreground">المريض *</p>
              {patient ? (
                <div className="flex items-center justify-between rounded-xl border border-accent bg-accent/5 px-4 py-2.5">
                  <div>
                    <p className="font-sans text-sm font-medium text-foreground">
                      {patient.fullName}
                    </p>
                    {patient.phone && (
                      <p className="font-sans text-xs text-muted-foreground" dir="ltr">
                        {patient.phone}
                      </p>
                    )}
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label="تغيير المريض"
                    onClick={() => setPatient(null)}
                  >
                    <X />
                  </Button>
                </div>
              ) : (
                <>
                  <FormField
                    value={query}
                    onValueChange={setQuery}
                    placeholder="ابحث بالاسم أو رقم الهاتف..."
                    startIcon={<Search className="h-4 w-4" />}
                    autoFocus
                  />
                  {query.trim() && (
                    <div className="mt-2 max-h-48 overflow-y-auto rounded-xl border border-border">
                      {searching ? (
                        <div className="flex justify-center py-4">
                          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                        </div>
                      ) : results.length === 0 ? (
                        <p className="px-4 py-3 text-center font-sans text-sm text-muted-foreground">
                          لا يوجد مريض مطابق — أضف المريض أولاً (أو احجز له موعداً) ثم أنشئ العملية.
                        </p>
                      ) : (
                        results.map((r) => (
                          <button
                            key={r.id}
                            type="button"
                            onClick={() => setPatient(r)}
                            className="flex w-full items-center justify-between px-4 py-2.5 text-start font-sans text-sm transition-colors hover:bg-muted"
                          >
                            <span className="text-foreground">{r.fullName}</span>
                            {r.phone && (
                              <span className="text-xs text-muted-foreground" dir="ltr">
                                {r.phone}
                              </span>
                            )}
                          </button>
                        ))
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FormField
              type="select"
              label="نوع العملية"
              options={serviceOptions}
              value={serviceId}
              onValueChange={setServiceId}
              hint={
                options.services.length === 0
                  ? "أضف أنواع العمليات من «الخدمات» (نوع: عملية) لتُنسخ التجهيزات والتعليمات تلقائياً."
                  : "تُنسخ قائمة التجهيزات والتعليمات من نوع العملية."
              }
            />
            {serviceId === OTHER ? (
              <FormField
                label="اسم العملية *"
                value={name}
                onValueChange={setName}
                placeholder="مثال: استئصال المرارة بالمنظار"
              />
            ) : (
              <div />
            )}
            <FormField
              type="select"
              label="الجرّاح"
              options={options.doctors.map((d) => ({ value: d.id, label: d.name }))}
              value={doctorId}
              onValueChange={setDoctorId}
              placeholder="يُحدَّد لاحقاً"
            />
            <FormField
              type="select"
              label="المكان"
              options={placeOptions}
              value={place}
              onValueChange={setPlace}
              placeholder="يُحدَّد لاحقاً"
            />
            {place === HOSPITAL && (
              <FormField
                label="اسم المستشفى *"
                value={hospital}
                onValueChange={setHospital}
                className="sm:col-span-2"
              />
            )}
            <FormField
              type="number"
              inputMode="decimal"
              min={0}
              step="0.01"
              label="التكلفة المتفق عليها"
              value={price}
              onValueChange={setPrice}
              placeholder={
                serviceId !== OTHER
                  ? String(options.services.find((s) => s.id === serviceId)?.price ?? "")
                  : ""
              }
              hint="اختياري — يمكن تحديدها لاحقاً."
            />
          </div>
          <FormField
            type="textarea"
            rows={2}
            label="ملاحظات داخلية"
            value={notes}
            onValueChange={setNotes}
          />

          <div className="flex gap-3 pt-1">
            <Button onClick={submit} loading={isPending} className="flex-1">
              إنشاء العملية
            </Button>
            <Button variant="outline" onClick={() => setOpen(false)}>
              إلغاء
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
