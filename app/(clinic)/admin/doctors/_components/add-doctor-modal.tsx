"use client";

import { useState, useTransition, useRef } from "react";
import { UserPlus } from "lucide-react";
import Modal from "@/components/admin/modal";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Label } from "@/components/ui/label";
import { createDoctorAction } from "@/server/actions/admin";
import SpecialtySelect, { type SpecialtyOption } from "./specialty-select";
import AvailabilityRulesEditor, { type EditorBranchHours } from "./availability-rules-editor";
import { Alert } from "@/components/ui/alert";

export const DOCTOR_TITLE_OPTIONS = [
  { value: "", label: "غير محدد" },
  { value: "SPECIALIST", label: "أخصائي" },
  { value: "CONSULTANT", label: "استشاري" },
];

export interface BranchOption {
  id: string;
  name: string;
  hours: EditorBranchHours[];
}

export default function AddDoctorModal({
  branches,
  specialties,
}: {
  branches: BranchOption[];
  specialties: SpecialtyOption[];
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedBranchIds, setSelectedBranchIds] = useState<string[]>([]);
  const [isPending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  // Branches picked for the doctor, with their hours — the availability editor
  // only lets rules be added for branches the doctor actually works at.
  const selectedBranches = branches.filter((b) => selectedBranchIds.includes(b.id));

  function toggleBranch(id: string, checked: boolean) {
    setSelectedBranchIds((ids) => (checked ? [...ids, id] : ids.filter((x) => x !== id)));
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      const res = await createDoctorAction(formData);
      if (res?.error) {
        setError(res.error);
      } else {
        setOpen(false);
        formRef.current?.reset();
        setSelectedBranchIds([]);
      }
    });
  }

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <UserPlus />
        إضافة طبيب
      </Button>

      <Modal open={open} onClose={() => setOpen(false)} title="إضافة طبيب جديد" width="max-w-2xl">
        <form ref={formRef} onSubmit={handleSubmit} className="space-y-4">
          {error && <Alert variant="destructive">{error}</Alert>}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {/* Full name */}
            <FormField name="fullName" label="الاسم الكامل *" required placeholder="د. أحمد محمد" />

            {/* Title (rank) */}
            <FormField
              type="select"
              name="title"
              label="الدرجة (اختياري)"
              defaultValue=""
              options={DOCTOR_TITLE_OPTIONS}
            />

            {/* Specialty */}
            <div>
              <SpecialtySelect specialties={specialties} required />
            </div>

            {/* Years of experience */}
            <FormField
              type="number"
              name="yearsOfExperience"
              label="سنوات الخبرة (اختياري)"
              min={0}
              placeholder="10"
            />

            {/* Examination fee */}
            <FormField
              type="number"
              name="examinationFee"
              label="سعر الكشف (اختياري)"
              min={0}
              step="0.01"
              placeholder="200.00"
            />

            {/* Consultation (follow-up) fee */}
            <FormField
              type="number"
              name="consultationFee"
              label="سعر الاستشارة (اختياري)"
              min={0}
              step="0.01"
              placeholder="150.00"
            />
          </div>

          {/* Flags */}
          <div className="flex flex-wrap gap-4">
            <FormField
              type="checkbox"
              name="requiresAdvanceBooking"
              label="يحتاج حجزاً مسبقاً"
              defaultChecked
            />
            <FormField type="checkbox" name="acceptsChildren" label="يكشف على الأطفال" />
          </div>

          {/* Branches */}
          <div className="space-y-1.5">
            <Label className="font-sans text-sm font-medium text-foreground">فروع العمل</Label>
            {branches.length === 0 ? (
              <p className="font-sans text-xs text-muted-foreground">
                لا توجد فروع. أضف فرعاً من صفحة الفروع أولاً.
              </p>
            ) : (
              <div className="flex flex-wrap gap-3">
                {branches.map((b) => (
                  <FormField
                    key={b.id}
                    type="checkbox"
                    name="branchIds"
                    value={b.id}
                    label={b.name}
                    labelClassName="cursor-pointer font-normal"
                    checked={selectedBranchIds.includes(b.id)}
                    onCheckedChange={(c) => toggleBranch(b.id, c)}
                    className="rounded-xl border border-border px-3 py-2 hover:bg-muted"
                  />
                ))}
              </div>
            )}
          </div>

          {/* Availability rules (drafted, created with the doctor) */}
          <AvailabilityRulesEditor mode="draft" branches={selectedBranches} />

          {/* Qualifications */}
          <FormField
            type="textarea"
            name="qualifications"
            label="المؤهلات العلمية (اختياري)"
            rows={2}
            placeholder="بكالوريوس الطب والجراحة، ماجستير..."
          />

          {/* Areas of sub-specialty expertise */}
          <FormField
            type="textarea"
            name="expertiseAreas"
            label="مجالات الخبرة الدقيقة (اختياري)"
            rows={2}
            placeholder="جراحة المناظير، أمراض القلب التداخلية..."
          />

          {/* Bio */}
          <FormField
            type="textarea"
            name="bio"
            label="نبذة تعريفية (اختياري)"
            rows={3}
            placeholder="خبرة في..."
          />

          <div className="flex gap-3 pt-2">
            <Button type="submit" loading={isPending} className="flex-1">
              {isPending ? "جارٍ الحفظ..." : "إضافة الطبيب"}
            </Button>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              إلغاء
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
