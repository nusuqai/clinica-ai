"use client";

import { useState, useTransition } from "react";
import { Pencil } from "lucide-react";
import Modal from "@/components/admin/modal";
import { updateDoctorAction } from "@/server/actions/admin";
import type { DoctorWithProfile } from "@/server/services/doctors";
import type { BranchOption } from "./add-doctor-modal";
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
      <button
        onClick={() => setOpen(true)}
        className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary"
        title="تعديل"
      >
        <Pencil className="h-4 w-4" />
      </button>

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
            <div className="space-y-1.5">
              <label className="font-sans text-sm font-medium text-foreground">الاسم الكامل</label>
              <input
                name="fullName"
                defaultValue={doctor.profile.fullName}
                className="w-full rounded-xl border border-border bg-background px-3 py-2 font-sans text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
            <div className="space-y-1.5">
              <label className="font-sans text-sm font-medium text-foreground">الدرجة</label>
              <select
                name="title"
                defaultValue={doctor.title ?? ""}
                className="w-full rounded-xl border border-border bg-background px-3 py-2 font-sans text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
              >
                <option value="">غير محدد</option>
                <option value="SPECIALIST">أخصائي</option>
                <option value="CONSULTANT">استشاري</option>
              </select>
            </div>
            <div>
              <SpecialtySelect specialties={specialties} defaultSpecialtyId={doctor.specialtyId} />
            </div>
            <div className="space-y-1.5">
              <label className="font-sans text-sm font-medium text-foreground">سنوات الخبرة</label>
              <input
                name="yearsOfExperience"
                type="number"
                min={0}
                dir="ltr"
                defaultValue={doctor.yearsOfExperience?.toString() ?? ""}
                className="w-full rounded-xl border border-border bg-background px-3 py-2 font-sans text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
            <div className="space-y-1.5">
              <label className="font-sans text-sm font-medium text-foreground">سعر الكشف</label>
              <input
                name="examinationFee"
                type="number"
                min={0}
                step="0.01"
                dir="ltr"
                defaultValue={doctor.examinationFee?.toString() ?? ""}
                className="w-full rounded-xl border border-border bg-background px-3 py-2 font-sans text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
            <div className="space-y-1.5">
              <label className="font-sans text-sm font-medium text-foreground">سعر الاستشارة</label>
              <input
                name="consultationFee"
                type="number"
                min={0}
                step="0.01"
                dir="ltr"
                defaultValue={doctor.consultationFee?.toString() ?? ""}
                className="w-full rounded-xl border border-border bg-background px-3 py-2 font-sans text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
          </div>

          {/* Flags */}
          <div className="flex flex-wrap gap-4">
            <label className="flex items-center gap-2 font-sans text-sm font-medium text-foreground">
              <input
                type="checkbox"
                name="requiresAdvanceBooking"
                defaultChecked={doctor.requiresAdvanceBooking}
              />
              يحتاج حجزاً مسبقاً
            </label>
            <label className="flex items-center gap-2 font-sans text-sm font-medium text-foreground">
              <input
                type="checkbox"
                name="acceptsChildren"
                defaultChecked={doctor.acceptsChildren}
              />
              يكشف على الأطفال
            </label>
          </div>

          {/* Branches */}
          <div className="space-y-1.5">
            <label className="font-sans text-sm font-medium text-foreground">فروع العمل</label>
            {branches.length === 0 ? (
              <p className="font-sans text-xs text-muted-foreground">
                لا توجد فروع. أضف فرعاً من صفحة الفروع أولاً.
              </p>
            ) : (
              <div className="flex flex-wrap gap-3">
                {branches.map((b) => (
                  <label
                    key={b.id}
                    className="flex cursor-pointer items-center gap-2 rounded-xl border border-border px-3 py-2 font-sans text-sm hover:bg-muted"
                  >
                    <input
                      type="checkbox"
                      name="branchIds"
                      value={b.id}
                      defaultChecked={doctor.branchIds.includes(b.id)}
                    />
                    {b.name}
                  </label>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <label className="font-sans text-sm font-medium text-foreground">
              المؤهلات العلمية
            </label>
            <textarea
              name="qualifications"
              rows={2}
              defaultValue={doctor.qualifications ?? ""}
              className="w-full resize-none rounded-xl border border-border bg-background px-3 py-2 font-sans text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>

          <div className="space-y-1.5">
            <label className="font-sans text-sm font-medium text-foreground">
              مجالات الخبرة الدقيقة
            </label>
            <textarea
              name="expertiseAreas"
              rows={2}
              defaultValue={doctor.expertiseAreas ?? ""}
              className="w-full resize-none rounded-xl border border-border bg-background px-3 py-2 font-sans text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>

          <div className="space-y-1.5">
            <label className="font-sans text-sm font-medium text-foreground">
              النبذة التعريفية
            </label>
            <textarea
              name="bio"
              rows={3}
              defaultValue={doctor.bio ?? ""}
              className="w-full resize-none rounded-xl border border-border bg-background px-3 py-2 font-sans text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>

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
            <button
              type="submit"
              disabled={isPending}
              className="flex-1 rounded-xl bg-primary py-2.5 font-sans text-sm font-medium text-white transition-colors hover:bg-primary/90 disabled:opacity-60"
            >
              {isPending ? "جارٍ الحفظ..." : "حفظ التعديلات"}
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-xl border border-border px-4 font-sans text-sm font-medium text-foreground transition-colors hover:bg-muted"
            >
              إلغاء
            </button>
          </div>
        </form>
      </Modal>
    </>
  );
}
