"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, Zap } from "lucide-react";
import {
  createRuleAction,
  deleteRuleAction,
  generateSlotsAction,
  toggleRuleActiveAction,
} from "@/server/actions/admin";
import Modal from "@/components/admin/modal";
import type { AvailabilityRule, DayOfWeek } from "@prisma/client";
import { formatSlotDate } from "@/lib/slot-time";

const DAY_LABELS: Record<DayOfWeek, string> = {
  SUN: "الأحد",
  MON: "الاثنين",
  TUE: "الثلاثاء",
  WED: "الأربعاء",
  THU: "الخميس",
  FRI: "الجمعة",
  SAT: "السبت",
};

const DAYS_ORDER: DayOfWeek[] = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

interface RulesTabProps {
  doctorId: string;
  rules: AvailabilityRule[];
}

export default function RulesTab({ doctorId, rules }: RulesTabProps) {
  const router = useRouter();
  const [addOpen, setAddOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [generatingId, setGeneratingId] = useState<string | null>(null);

  function showSuccess(msg: string) {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(null), 4000);
  }

  function handleAdd(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const formData = new FormData(e.currentTarget);
    formData.set("doctorId", doctorId);
    startTransition(async () => {
      const res = await createRuleAction(formData);
      if (res?.error) { setError(res.error); return; }
      setAddOpen(false);
      showSuccess("تم إنشاء القاعدة وتوليد المواعيد");
      router.refresh();
    });
  }

  function handleDelete(ruleId: string) {
    if (!confirm("سيتم حذف هذه القاعدة والمواعيد المستقبلية غير المحجوزة. هل تريد المتابعة؟")) return;
    setError(null);
    startTransition(async () => {
      const res = await deleteRuleAction(ruleId, doctorId);
      if (res?.error) { setError(res.error); return; }
      router.refresh();
    });
  }

  function handleToggleActive(rule: AvailabilityRule) {
    setError(null);
    startTransition(async () => {
      const res = await toggleRuleActiveAction(rule.id, !rule.isActive, doctorId);
      if (res?.error) { setError(res.error); return; }
      router.refresh();
    });
  }

  async function handleGenerate(ruleId: string) {
    setGeneratingId(ruleId);
    setError(null);
    const res = await generateSlotsAction(ruleId, doctorId);
    setGeneratingId(null);
    if (res?.error) { setError(res.error); return; }
    if ("count" in res) {
      showSuccess(`تم توليد ${res.count} موعد جديد`);
      router.refresh();
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-muted-foreground font-sans">{rules.length} قاعدة</p>
        <button
          onClick={() => setAddOpen(true)}
          className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-xl text-sm font-medium font-sans hover:bg-primary/90 transition-colors"
        >
          <Plus className="w-4 h-4" />
          إضافة قاعدة
        </button>
      </div>

      {error && (
        <div className="mb-4 bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm font-sans">
          {error}
        </div>
      )}
      {successMsg && (
        <div className="mb-4 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-xl px-4 py-3 text-sm font-sans">
          {successMsg}
        </div>
      )}

      {rules.length === 0 ? (
        <div className="bg-card border border-border rounded-2xl py-16 text-center">
          <p className="text-muted-foreground font-sans">
            لا توجد قواعد توفر. أضف قاعدة لتبدأ في استقبال المواعيد.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {rules.map((rule) => (
            <div
              key={rule.id}
              className="bg-card border border-border rounded-2xl px-5 py-4 flex flex-col sm:flex-row sm:items-center gap-3"
            >
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2 mb-1">
                  <span className="font-medium text-foreground font-sans">
                    {DAY_LABELS[rule.dayOfWeek]}
                  </span>
                  <span className="text-muted-foreground font-sans text-sm" dir="ltr">
                    {rule.startTime} – {rule.endTime}
                  </span>
                  <span className="text-xs text-muted-foreground font-sans bg-muted px-2 py-0.5 rounded-full">
                    {rule.slotDurationMin} دقيقة / موعد
                  </span>
                  <span
                    className={[
                      "text-xs font-medium px-2 py-0.5 rounded-full font-sans",
                      rule.isActive
                        ? "bg-emerald-100 text-emerald-700"
                        : "bg-gray-100 text-gray-500",
                    ].join(" ")}
                  >
                    {rule.isActive ? "نشطة" : "معطّلة"}
                  </span>
                </div>
                {rule.generatedUntil && (
                  <p className="text-xs text-muted-foreground font-sans">
                    آخر توليد حتى:{" "}
                    {formatSlotDate(rule.generatedUntil, {
                      day: "numeric",
                      month: "long",
                      year: "numeric",
                    })}
                  </p>
                )}
              </div>

              <div className="flex items-center gap-2 flex-shrink-0">
                <button
                  onClick={() => handleToggleActive(rule)}
                  disabled={isPending}
                  title={rule.isActive ? "تعطيل" : "تفعيل"}
                  className={[
                    "relative inline-flex h-5 w-9 items-center rounded-full transition-colors disabled:opacity-50",
                    rule.isActive ? "bg-emerald-500" : "bg-muted-foreground/30",
                  ].join(" ")}
                >
                  <span
                    className={[
                      "inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform",
                      rule.isActive ? "-translate-x-4" : "-translate-x-1",
                    ].join(" ")}
                  />
                </button>

                <button
                  onClick={() => handleGenerate(rule.id)}
                  disabled={generatingId === rule.id}
                  title="توليد مواعيد للـ 30 يوم القادمة"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium font-sans border border-border rounded-lg text-muted-foreground hover:text-primary hover:border-primary/50 transition-colors disabled:opacity-50"
                >
                  <Zap className="w-3.5 h-3.5" />
                  {generatingId === rule.id ? "جارٍ التوليد..." : "توليد مواعيد"}
                </button>

                <button
                  onClick={() => handleDelete(rule.id)}
                  disabled={isPending}
                  title="حذف القاعدة"
                  className="p-1.5 rounded-lg text-muted-foreground hover:text-red-500 hover:bg-red-50 transition-colors disabled:opacity-40"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal open={addOpen} onClose={() => setAddOpen(false)} title="إضافة قاعدة توفر">
        <form onSubmit={handleAdd} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5 sm:col-span-2">
              <label className="text-sm font-medium text-foreground font-sans">يوم الأسبوع *</label>
              <select
                name="dayOfWeek"
                required
                className="w-full border border-border rounded-xl px-3 py-2 text-sm bg-background text-foreground font-sans focus:outline-none focus:ring-2 focus:ring-primary/30"
              >
                {DAYS_ORDER.map((day) => (
                  <option key={day} value={day}>
                    {DAY_LABELS[day]}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground font-sans">وقت البداية *</label>
              <input
                name="startTime"
                type="time"
                required
                defaultValue="09:00"
                dir="ltr"
                className="w-full border border-border rounded-xl px-3 py-2 text-sm bg-background text-foreground font-sans focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground font-sans">وقت النهاية *</label>
              <input
                name="endTime"
                type="time"
                required
                defaultValue="17:00"
                dir="ltr"
                className="w-full border border-border rounded-xl px-3 py-2 text-sm bg-background text-foreground font-sans focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>

            <div className="space-y-1.5 sm:col-span-2">
              <label className="text-sm font-medium text-foreground font-sans">مدة الموعد</label>
              <select
                name="slotDurationMin"
                defaultValue="30"
                className="w-full border border-border rounded-xl px-3 py-2 text-sm bg-background text-foreground font-sans focus:outline-none focus:ring-2 focus:ring-primary/30"
              >
                {[15, 20, 30, 45, 60].map((d) => (
                  <option key={d} value={d}>
                    {d} دقيقة
                  </option>
                ))}
              </select>
            </div>
          </div>

          <p className="text-xs text-muted-foreground font-sans">
            سيتم تلقائياً توليد مواعيد الـ 30 يوم القادمة عند الحفظ.
          </p>

          <div className="flex gap-3 pt-2">
            <button
              type="submit"
              disabled={isPending}
              className="flex-1 bg-primary text-white rounded-xl py-2.5 text-sm font-medium font-sans hover:bg-primary/90 transition-colors disabled:opacity-60"
            >
              {isPending ? "جارٍ الحفظ..." : "حفظ القاعدة"}
            </button>
            <button
              type="button"
              onClick={() => setAddOpen(false)}
              className="px-4 border border-border rounded-xl text-sm font-medium font-sans text-foreground hover:bg-muted transition-colors"
            >
              إلغاء
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
