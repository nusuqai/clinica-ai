"use client";

import { useState, useTransition } from "react";
import { Pencil } from "lucide-react";
import Modal from "@/components/admin/modal";
import { updateDoctorAction } from "@/server/actions/admin";
import type { DoctorWithProfile } from "@/server/services/doctors";
import { DOCTOR_TITLE_OPTIONS, type BranchOption } from "./add-doctor-modal";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Label } from "@/components/ui/label";
import SpecialtySelect, { type SpecialtyOption } from "./specialty-select";
import AvailabilityRulesEditor from "./availability-rules-editor";

interface EditDoctorModalProps {
  doctor: DoctorWithProfile;
  branches: BranchOption[];
  specialties: SpecialtyOption[];
}

export default function EditDoctorModal({ doctor, branches, specialties }: EditDoctorModalProps) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const formData = new FormData(e.currentTarget);
    formData.set("doctorId", doctor.id);
    startTransition(async () => {
      const res = await updateDoctorAction(formData);
      if (res?.error) setError(res.error);
      else setOpen(false);
    });
  }

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setOpen(true)}
        className="hover:bg-primary/10 hover:text-primary"
        title="تعديل"
      >
        <Pencil />
      </Button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="تعديل بيانات الطبيب"
        width="max-w-2xl"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 font-sans text-sm text-red-700">
              {error}
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FormField
              name="fullName"
              label="الاسم الكامل"
              defaultValue={doctor.profile.fullName}
            />
            <FormField
              type="select"
              name="title"
              label="الدرجة"
              defaultValue={doctor.title ?? ""}
              options={DOCTOR_TITLE_OPTIONS}
            />
            <div>
              <SpecialtySelect specialties={specialties} defaultSpecialtyId={doctor.specialtyId} />
            </div>
            <FormField
              type="number"
              name="yearsOfExperience"
              label="سنوات الخبرة"
              min={0}
              defaultValue={doctor.yearsOfExperience?.toString() ?? ""}
            />
            <FormField
              type="number"
              name="examinationFee"
              label="سعر الكشف"
              min={0}
              step="0.01"
              defaultValue={doctor.examinationFee?.toString() ?? ""}
            />
            <FormField
              type="number"
              name="consultationFee"
              label="سعر الاستشارة"
              min={0}
              step="0.01"
              defaultValue={doctor.consultationFee?.toString() ?? ""}
            />
          </div>

          {/* Flags */}
          <div className="flex flex-wrap gap-4">
            <FormField
              type="checkbox"
              name="requiresAdvanceBooking"
              label="يحتاج حجزاً مسبقاً"
              defaultChecked={doctor.requiresAdvanceBooking}
            />
            <FormField
              type="checkbox"
              name="acceptsChildren"
              label="يكشف على الأطفال"
              defaultChecked={doctor.acceptsChildren}
            />
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
                    defaultChecked={doctor.branchIds.includes(b.id)}
                    className="rounded-xl border border-border px-3 py-2 hover:bg-muted"
                  />
                ))}
              </div>
            )}
          </div>

          <FormField
            type="textarea"
            name="qualifications"
            label="المؤهلات العلمية"
            rows={2}
            defaultValue={doctor.qualifications ?? ""}
          />

          <FormField
            type="textarea"
            name="expertiseAreas"
            label="مجالات الخبرة الدقيقة"
            rows={2}
            defaultValue={doctor.expertiseAreas ?? ""}
          />

          <FormField
            type="textarea"
            name="bio"
            label="النبذة التعريفية"
            rows={3}
            defaultValue={doctor.bio ?? ""}
          />

          {/* Availability rules — live add/remove for the doctor's branches */}
          {open && (
            <AvailabilityRulesEditor
              mode="live"
              doctorId={doctor.id}
              branches={branches.filter((b) => doctor.branchIds.includes(b.id))}
              clinicId={doctor.clinicId}
            />
          )}

          <div className="flex gap-3 pt-2">
            <Button type="submit" loading={isPending} className="flex-1">
              {isPending ? "جارٍ الحفظ..." : "حفظ التعديلات"}
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
