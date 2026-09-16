"use client";

import { useState, useTransition, useRef } from "react";
import { UserPlus } from "lucide-react";
import Modal from "@/components/admin/modal";
import { createDoctorAction } from "@/server/actions/admin";
import SpecialtySelect, { type SpecialtyOption } from "./specialty-select";
import AvailabilityRulesEditor, { type EditorBranchHours } from "./availability-rules-editor";

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
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 font-sans text-sm font-medium text-white transition-colors hover:bg-primary/90"
      >
        <UserPlus className="h-4 w-4" />
        إضافة طبيب
      </button>

      <Modal open={open} onClose={() => setOpen(false)} title="إضافة طبيب جديد" width="max-w-2xl">
        <form ref={formRef} onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 font-sans text-sm text-red-700">
              {error}
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {/* Full name */}
            <div className="space-y-1.5">
              <label className="font-sans text-sm font-medium text-foreground">
                الاسم الكامل *
              </label>
              <input
                name="fullName"
                required
                placeholder="د. أحمد محمد"
                className="w-full rounded-xl border border-border bg-background px-3 py-2 font-sans text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>

            {/* Title (rank) */}
            <div className="space-y-1.5">
              <label className="font-sans text-sm font-medium text-foreground">
                الدرجة (اختياري)
              </label>
              <select
                name="title"
                defaultValue=""
                className="w-full rounded-xl border border-border bg-background px-3 py-2 font-sans text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
              >
                <option value="">غير محدد</option>
                <option value="SPECIALIST">أخصائي</option>
                <option value="CONSULTANT">استشاري</option>
              </select>
            </div>

            {/* Specialty */}
            <div>
              <SpecialtySelect specialties={specialties} required />
            </div>

            {/* Years of experience */}
            <div className="space-y-1.5">
              <label className="font-sans text-sm font-medium text-foreground">
                سنوات الخبرة (اختياري)
              </label>
              <input
                name="yearsOfExperience"
                type="number"
                min={0}
                dir="ltr"
                placeholder="10"
                className="w-full rounded-xl border border-border bg-background px-3 py-2 font-sans text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>

            {/* Examination fee */}
            <div className="space-y-1.5">
              <label className="font-sans text-sm font-medium text-foreground">
                سعر الكشف (اختياري)
              </label>
              <input
                name="examinationFee"
                type="number"
                min={0}
                step="0.01"
                dir="ltr"
                placeholder="200.00"
                className="w-full rounded-xl border border-border bg-background px-3 py-2 font-sans text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>

            {/* Consultation (follow-up) fee */}
            <div className="space-y-1.5">
              <label className="font-sans text-sm font-medium text-foreground">
                سعر الاستشارة (اختياري)
              </label>
              <input
                name="consultationFee"
                type="number"
                min={0}
                step="0.01"
                dir="ltr"
                placeholder="150.00"
                className="w-full rounded-xl border border-border bg-background px-3 py-2 font-sans text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
          </div>

          {/* Flags */}
          <div className="flex flex-wrap gap-4">
            <label className="flex items-center gap-2 font-sans text-sm font-medium text-foreground">
              <input type="checkbox" name="requiresAdvanceBooking" defaultChecked />
              يحتاج حجزاً مسبقاً
            </label>
            <label className="flex items-center gap-2 font-sans text-sm font-medium text-foreground">
              <input type="checkbox" name="acceptsChildren" />
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
                      checked={selectedBranchIds.includes(b.id)}
                      onChange={(e) => toggleBranch(b.id, e.target.checked)}
                    />
                    {b.name}
                  </label>
                ))}
              </div>
            )}
          </div>

          {/* Availability rules (drafted, created with the doctor) */}
          <AvailabilityRulesEditor mode="draft" branches={selectedBranches} />

          {/* Qualifications */}
          <div className="space-y-1.5">
            <label className="font-sans text-sm font-medium text-foreground">
              المؤهلات العلمية (اختياري)
            </label>
            <textarea
              name="qualifications"
              rows={2}
              placeholder="بكالوريوس الطب والجراحة، ماجستير..."
              className="w-full resize-none rounded-xl border border-border bg-background px-3 py-2 font-sans text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>

          {/* Areas of sub-specialty expertise */}
          <div className="space-y-1.5">
            <label className="font-sans text-sm font-medium text-foreground">
              مجالات الخبرة الدقيقة (اختياري)
            </label>
            <textarea
              name="expertiseAreas"
              rows={2}
              placeholder="جراحة المناظير، أمراض القلب التداخلية..."
              className="w-full resize-none rounded-xl border border-border bg-background px-3 py-2 font-sans text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>

          {/* Bio */}
          <div className="space-y-1.5">
            <label className="font-sans text-sm font-medium text-foreground">
              نبذة تعريفية (اختياري)
            </label>
            <textarea
              name="bio"
              rows={3}
              placeholder="خبرة في..."
              className="w-full resize-none rounded-xl border border-border bg-background px-3 py-2 font-sans text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="submit"
              disabled={isPending}
              className="flex-1 rounded-xl bg-primary py-2.5 font-sans text-sm font-medium text-white transition-colors hover:bg-primary/90 disabled:opacity-60"
            >
              {isPending ? "جارٍ الحفظ..." : "إضافة الطبيب"}
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
