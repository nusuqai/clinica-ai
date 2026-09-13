"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, Zap } from "lucide-react";
import {
  createMyRuleAction,
  deleteMyRuleAction,
  generateMySlotsAction,
  toggleMyRuleActiveAction,
} from "@/server/actions/doctor";
import Modal from "@/components/admin/modal";
import { DayOfWeek, AvailabilityMode, type AvailabilityRule } from "@prisma/client";
import { formatSlotDate } from "@/lib/slot-time";
import { queueCapacityHint } from "@/lib/availability/queue-capacity";

export interface DoctorBranchHours {
  dayOfWeek: DayOfWeek;
  isClosed: boolean;
  openTime: string | null;
  closeTime: string | null;
}
export interface DoctorBranchOption {
  id: string;
  name: string;
  hours: DoctorBranchHours[];
}

type RuleRow = AvailabilityRule & { branch: { id: string; name: string } | null };

const DAY_LABELS: Record<DayOfWeek, string> = {
  [DayOfWeek.SUN]: "الأحد",
  [DayOfWeek.MON]: "الاثنين",
  [DayOfWeek.TUE]: "الثلاثاء",
  [DayOfWeek.WED]: "الأربعاء",
  [DayOfWeek.THU]: "الخميس",
  [DayOfWeek.FRI]: "الجمعة",
  [DayOfWeek.SAT]: "السبت",
};

const DAYS_ORDER: DayOfWeek[] = [
  DayOfWeek.SUN,
  DayOfWeek.MON,
  DayOfWeek.TUE,
  DayOfWeek.WED,
  DayOfWeek.THU,
  DayOfWeek.FRI,
  DayOfWeek.SAT,
];

interface DoctorRulesTabProps {
  rules: RuleRow[];
  branches: DoctorBranchOption[];
}

export default function DoctorRulesTab({ rules, branches }: DoctorRulesTabProps) {
  const router = useRouter();
  const [addOpen, setAddOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [generatingId, setGeneratingId] = useState<string | null>(null);
  const [selBranch, setSelBranch] = useState<string>(branches[0]?.id ?? "");
  const [selDay, setSelDay] = useState<DayOfWeek>(DayOfWeek.SAT);
  const [selMode, setSelMode] = useState<AvailabilityMode>(AvailabilityMode.SLOT_BASED);
  const isOrder = selMode === AvailabilityMode.ORDER_BASED;
  // Tracked only to render the live queue-capacity hint; inputs stay uncontrolled.
  const [selStart, setSelStart] = useState("09:00");
  const [selEnd, setSelEnd] = useState("17:00");
  const [selEstDur, setSelEstDur] = useState(10);
  const [selCap, setSelCap] = useState(50);
  const capHint = isOrder ? queueCapacityHint(selStart, selEnd, selEstDur, selCap) : null;

  const branchWindow = (() => {
    const branch = branches.find((b) => b.id === selBranch);
    if (!branch) return null;
    const row = branch.hours.find((h) => h.dayOfWeek === selDay);
    if (!row)
      return { text: "لم تُحدَّد ساعات لهذا الفرع في هذا اليوم (سيُسمح بأي وقت).", ok: true };
    if (row.isClosed) return { text: "الفرع مغلق في هذا اليوم.", ok: false };
    if (row.openTime && row.closeTime)
      return { text: `ساعات عمل الفرع: ${row.openTime} – ${row.closeTime}`, ok: true };
    return { text: "ساعات هذا اليوم غير مكتملة.", ok: true };
  })();

  function showSuccess(msg: string) {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(null), 4000);
  }

  function handleAdd(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      const res = await createMyRuleAction(formData);
      if (res?.error) {
        setError(res.error);
        return;
      }
      setAddOpen(false);
      showSuccess("تم إنشاء القاعدة وتوليد المواعيد");
      router.refresh();
    });
  }

  function handleDelete(ruleId: string) {
    if (!confirm("سيتم حذف هذه القاعدة والمواعيد المستقبلية غير المحجوزة. هل تريد المتابعة؟"))
      return;
    setError(null);
    startTransition(async () => {
      const res = await deleteMyRuleAction(ruleId);
      if (res?.error) {
        setError(res.error);
        return;
      }
      router.refresh();
    });
  }

  function handleToggleActive(rule: AvailabilityRule) {
    setError(null);
    startTransition(async () => {
      const res = await toggleMyRuleActiveAction(rule.id, !rule.isActive);
      if (res?.error) {
        setError(res.error);
        return;
      }
      router.refresh();
    });
  }

  async function handleGenerate(ruleId: string) {
    setGeneratingId(ruleId);
    setError(null);
    const res = await generateMySlotsAction(ruleId);
    setGeneratingId(null);
    if (res?.error) {
      setError(res.error);
      return;
    }
    if ("count" in res) {
      showSuccess(`تم توليد ${res.count} موعد جديد`);
      router.refresh();
    }
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <p className="font-sans text-sm text-muted-foreground">{rules.length} قاعدة</p>
        <button
          onClick={() => setAddOpen(true)}
          disabled={branches.length === 0}
          title={branches.length === 0 ? "لم يتم تعيينك لأي فرع بعد" : undefined}
          className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 font-sans text-sm font-medium text-white transition-colors hover:bg-primary/90 disabled:opacity-50"
        >
          <Plus className="h-4 w-4" />
          إضافة قاعدة
        </button>
      </div>

      {branches.length === 0 && (
        <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 font-sans text-sm text-amber-700">
          لم يتم تعيينك لأي فرع بعد. تواصل مع مسؤول العيادة لتعيين فرع عملك قبل إضافة قواعد التوفر.
        </div>
      )}

      {error && (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 font-sans text-sm text-red-700">
          {error}
        </div>
      )}
      {successMsg && (
        <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 font-sans text-sm text-emerald-700">
          {successMsg}
        </div>
      )}

      {rules.length === 0 ? (
        <div className="rounded-2xl border border-border bg-card py-16 text-center">
          <p className="font-sans text-muted-foreground">
            لا توجد قواعد توفر. أضف قاعدة لتبدأ في استقبال المواعيد.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {rules.map((rule) => (
            <div
              key={rule.id}
              className="flex flex-col gap-3 rounded-2xl border border-border bg-card px-5 py-4 sm:flex-row sm:items-center"
            >
              <div className="min-w-0 flex-1">
                <div className="mb-1 flex flex-wrap items-center gap-2">
                  <span className="font-sans font-medium text-foreground">
                    {DAY_LABELS[rule.dayOfWeek]}
                  </span>
                  <span className="font-sans text-sm text-muted-foreground" dir="ltr">
                    {rule.startTime} – {rule.endTime}
                  </span>
                  {rule.branch && (
                    <span className="rounded-full bg-primary/10 px-2 py-0.5 font-sans text-xs text-primary">
                      {rule.branch.name}
                    </span>
                  )}
                  {rule.mode === AvailabilityMode.ORDER_BASED ? (
                    <span className="rounded-full bg-indigo-100 px-2 py-0.5 font-sans text-xs font-medium text-indigo-700">
                      نظام الدور
                      {rule.dailyCap != null ? ` · حد ${rule.dailyCap}` : ""}
                      {rule.estimatedDurationMin != null
                        ? ` · ~${rule.estimatedDurationMin} د/مريض`
                        : ""}
                    </span>
                  ) : (
                    <span className="rounded-full bg-muted px-2 py-0.5 font-sans text-xs text-muted-foreground">
                      {rule.slotDurationMin} دقيقة / موعد
                    </span>
                  )}
                  <span
                    className={[
                      "rounded-full px-2 py-0.5 font-sans text-xs font-medium",
                      rule.isActive
                        ? "bg-emerald-100 text-emerald-700"
                        : "bg-gray-100 text-gray-500",
                    ].join(" ")}
                  >
                    {rule.isActive ? "نشطة" : "معطّلة"}
                  </span>
                  {rule.referralOnly && (
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 font-sans text-xs font-medium text-amber-700">
                      تحويلات فقط
                    </span>
                  )}
                </div>
                {rule.note && (
                  <p className="mb-1 font-sans text-xs text-muted-foreground">{rule.note}</p>
                )}
                {rule.generatedUntil && (
                  <p className="font-sans text-xs text-muted-foreground">
                    آخر توليد حتى:{" "}
                    {formatSlotDate(rule.generatedUntil, {
                      day: "numeric",
                      month: "long",
                      year: "numeric",
                    })}
                  </p>
                )}
              </div>

              <div className="flex flex-shrink-0 items-center gap-2">
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

                {/* Queue (order-based) rules need no slot generation — the day
                    is implicitly available and order numbers are handed out on
                    booking, so the generate button is slot-based only. */}
                {rule.mode !== AvailabilityMode.ORDER_BASED && (
                  <button
                    onClick={() => handleGenerate(rule.id)}
                    disabled={generatingId === rule.id}
                    title="توليد مواعيد للـ 30 يوم القادمة"
                    className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 font-sans text-xs font-medium text-muted-foreground transition-colors hover:border-primary/50 hover:text-primary disabled:opacity-50"
                  >
                    <Zap className="h-3.5 w-3.5" />
                    {generatingId === rule.id ? "جارٍ التوليد..." : "توليد مواعيد"}
                  </button>
                )}

                <button
                  onClick={() => handleDelete(rule.id)}
                  disabled={isPending}
                  title="حذف القاعدة"
                  className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-red-50 hover:text-red-500 disabled:opacity-40"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal open={addOpen} onClose={() => setAddOpen(false)} title="إضافة قاعدة توفر">
        <form onSubmit={handleAdd} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <label className="font-sans text-sm font-medium text-foreground">الفرع *</label>
              <select
                name="branchId"
                required
                value={selBranch}
                onChange={(e) => setSelBranch(e.target.value)}
                className="w-full rounded-xl border border-border bg-background px-3 py-2 font-sans text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
              >
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <label className="font-sans text-sm font-medium text-foreground">يوم الأسبوع *</label>
              <select
                name="dayOfWeek"
                required
                value={selDay}
                onChange={(e) => setSelDay(e.target.value as DayOfWeek)}
                className="w-full rounded-xl border border-border bg-background px-3 py-2 font-sans text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
              >
                {DAYS_ORDER.map((day) => (
                  <option key={day} value={day}>
                    {DAY_LABELS[day]}
                  </option>
                ))}
              </select>
              {branchWindow && (
                <p
                  className={[
                    "mt-1 font-sans text-xs",
                    branchWindow.ok ? "text-muted-foreground" : "text-red-600",
                  ].join(" ")}
                >
                  {branchWindow.text}
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              <label className="font-sans text-sm font-medium text-foreground">وقت البداية *</label>
              <input
                name="startTime"
                type="time"
                required
                defaultValue="09:00"
                onChange={(e) => setSelStart(e.target.value)}
                dir="ltr"
                className="w-full rounded-xl border border-border bg-background px-3 py-2 font-sans text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
            <div className="space-y-1.5">
              <label className="font-sans text-sm font-medium text-foreground">وقت النهاية *</label>
              <input
                name="endTime"
                type="time"
                required
                defaultValue="17:00"
                onChange={(e) => setSelEnd(e.target.value)}
                dir="ltr"
                className="w-full rounded-xl border border-border bg-background px-3 py-2 font-sans text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <label className="font-sans text-sm font-medium text-foreground">نظام الجدولة</label>
              <select
                name="mode"
                value={selMode}
                onChange={(e) => setSelMode(e.target.value as AvailabilityMode)}
                className="w-full rounded-xl border border-border bg-background px-3 py-2 font-sans text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
              >
                <option value={AvailabilityMode.SLOT_BASED}>مواعيد بأوقات ثابتة</option>
                <option value={AvailabilityMode.ORDER_BASED}>نظام الدور (طابور)</option>
              </select>
            </div>
            {isOrder ? (
              <>
                <div className="space-y-1.5">
                  <label className="font-sans text-sm font-medium text-foreground">
                    دقائق الكشف التقديرية
                  </label>
                  <input
                    name="estimatedDurationMin"
                    type="number"
                    min={1}
                    defaultValue={10}
                    onChange={(e) => setSelEstDur(Number(e.target.value))}
                    className="w-full rounded-xl border border-border bg-background px-3 py-2 font-sans text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="font-sans text-sm font-medium text-foreground">
                    الحد الأقصى للحجوزات
                  </label>
                  <input
                    name="dailyCap"
                    type="number"
                    min={1}
                    defaultValue={50}
                    onChange={(e) => setSelCap(Number(e.target.value))}
                    className="w-full rounded-xl border border-border bg-background px-3 py-2 font-sans text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                  />
                </div>
                {capHint && (
                  <p
                    className={`rounded-xl px-3 py-2 font-sans text-sm sm:col-span-2 ${
                      capHint.tone === "warn"
                        ? "border border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200"
                        : "border border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200"
                    }`}
                  >
                    {capHint.text}
                  </p>
                )}
              </>
            ) : (
              <div className="space-y-1.5 sm:col-span-2">
                <label className="font-sans text-sm font-medium text-foreground">مدة الموعد</label>
                <select
                  name="slotDurationMin"
                  defaultValue="30"
                  className="w-full rounded-xl border border-border bg-background px-3 py-2 font-sans text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                >
                  {[15, 20, 30, 45, 60].map((d) => (
                    <option key={d} value={d}>
                      {d} دقيقة
                    </option>
                  ))}
                </select>
              </div>
            )}
            <label className="flex cursor-pointer items-start gap-2 sm:col-span-2">
              <input
                type="checkbox"
                name="referralOnly"
                className="mt-0.5 h-4 w-4 rounded border-border text-primary focus:ring-primary/30"
              />
              <span className="font-sans text-sm text-foreground">
                تحويلات فقط
                <span className="block text-xs text-muted-foreground">
                  لا يحجزها المرضى مباشرةً؛ تُحجز عبر تحويل من طبيب بعد الكشف.
                </span>
              </span>
            </label>
            <div className="space-y-1.5 sm:col-span-2">
              <label className="font-sans text-sm font-medium text-foreground">
                ملاحظة (اختياري)
              </label>
              <input
                name="note"
                type="text"
                placeholder="مثال: تحويلات حالات القلب فقط"
                className="w-full rounded-xl border border-border bg-background px-3 py-2 font-sans text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
          </div>
          <p className="font-sans text-xs text-muted-foreground">
            سيتم تلقائياً توليد مواعيد الـ 30 يوم القادمة عند الحفظ.
          </p>
          <div className="flex gap-3 pt-2">
            <button
              type="submit"
              disabled={isPending}
              className="flex-1 rounded-xl bg-primary py-2.5 font-sans text-sm font-medium text-white transition-colors hover:bg-primary/90 disabled:opacity-60"
            >
              {isPending ? "جارٍ الحفظ..." : "حفظ القاعدة"}
            </button>
            <button
              type="button"
              onClick={() => setAddOpen(false)}
              className="rounded-xl border border-border px-4 font-sans text-sm font-medium text-foreground transition-colors hover:bg-muted"
            >
              إلغاء
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
