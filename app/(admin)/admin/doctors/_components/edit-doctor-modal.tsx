"use client";

import { useState, useTransition } from "react";
import { Pencil } from "lucide-react";
import Modal from "@/components/admin/modal";
import { updateDoctorAction } from "@/server/actions/admin";
import type { DoctorWithProfile } from "@/server/services/doctors";

interface EditDoctorModalProps {
  doctor: DoctorWithProfile;
}

export default function EditDoctorModal({ doctor }: EditDoctorModalProps) {
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
        className="p-1.5 rounded-lg text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
        title="تعديل"
      >
        <Pencil className="w-4 h-4" />
      </button>

      <Modal open={open} onClose={() => setOpen(false)} title="تعديل بيانات الطبيب">
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm font-sans">
              {error}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground font-sans">الاسم الكامل</label>
              <input
                name="fullName"
                defaultValue={doctor.profile.fullName}
                className="w-full border border-border rounded-xl px-3 py-2 text-sm bg-background text-foreground font-sans focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground font-sans">الهاتف</label>
              <input
                name="phone"
                defaultValue={doctor.profile.phone ?? ""}
                dir="ltr"
                className="w-full border border-border rounded-xl px-3 py-2 text-sm bg-background text-foreground font-sans focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground font-sans">التخصص</label>
              <input
                name="specialty"
                defaultValue={doctor.specialty}
                className="w-full border border-border rounded-xl px-3 py-2 text-sm bg-background text-foreground font-sans focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground font-sans">رسوم الاستشارة</label>
              <input
                name="consultationFee"
                type="number"
                min={0}
                step="0.01"
                dir="ltr"
                defaultValue={doctor.consultationFee?.toString() ?? ""}
                className="w-full border border-border rounded-xl px-3 py-2 text-sm bg-background text-foreground font-sans focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground font-sans">النبذة التعريفية</label>
            <textarea
              name="bio"
              rows={3}
              defaultValue={doctor.bio ?? ""}
              className="w-full border border-border rounded-xl px-3 py-2 text-sm bg-background text-foreground font-sans resize-none focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="submit"
              disabled={isPending}
              className="flex-1 bg-primary text-white rounded-xl py-2.5 text-sm font-medium font-sans hover:bg-primary/90 transition-colors disabled:opacity-60"
            >
              {isPending ? "جارٍ الحفظ..." : "حفظ التعديلات"}
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="px-4 border border-border rounded-xl text-sm font-medium font-sans text-foreground hover:bg-muted transition-colors"
            >
              إلغاء
            </button>
          </div>
        </form>
      </Modal>
    </>
  );
}
