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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Switch } from "@/components/ui/switch";
import { DayOfWeek, AvailabilityMode, type AvailabilityRule } from "@prisma/client";
import { formatSlotDate } from "@/lib/slot-time";
import { queueCapacityHint } from "@/lib/availability/queue-capacity";
import { isQueueMode, MODE_BADGE_AR } from "@/lib/availability/modes";
import { Card } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { useConfirm } from "@/components/ui/confirm-dialog";

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
  const confirm = useConfirm();
  const [generatingId, setGeneratingId] = useState<string | null>(null);
  const [selBranch, setSelBranch] = useState<string>(branches[0]?.id ?? "");
  const [selDay, setSelDay] = useState<DayOfWeek>(DayOfWeek.SAT);
  const [selMode, setSelMode] = useState<AvailabilityMode>(AvailabilityMode.SLOT_BASED);
  const isQueue = isQueueMode(selMode); // نظام الدور or أسبقية الحضور
  // Tracked only to render the live queue-capacity hint; inputs stay uncontrolled.
  const [selStart, setSelStart] = useState("09:00");
  const [selEnd, setSelEnd] = useState("17:00");
  const [selEstDur, setSelEstDur] = useState(10);
  const [selCap, setSelCap] = useState(50);
  const capHint = isQueue ? queueCapacityHint(selStart, selEnd, selEstDur, selCap) : null;

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

  async function handleDelete(ruleId: string) {
    if (
      !(await confirm({
        title: "حذف القاعدة",
        description: "سيتم حذف هذه القاعدة والمواعيد المستقبلية غير المحجوزة. هل تريد المتابعة؟",
      }))
    )
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
        <Button
          onClick={() => setAddOpen(true)}
          disabled={branches.length === 0}
          title={branches.length === 0 ? "لم يتم تعيينك لأي فرع بعد" : undefined}
        >
          <Plus />
          إضافة قاعدة
        </Button>
      </div>

      {branches.length === 0 && (
        <Alert variant="warning" className="mb-4">
          لم يتم تعيينك لأي فرع بعد. تواصل مع مسؤول العيادة لتعيين فرع عملك قبل إضافة قواعد التوفر.
        </Alert>
      )}

      {error && (
        <Alert variant="destructive" className="mb-4">
          {error}
        </Alert>
      )}
      {successMsg && (
        <Alert variant="success" className="mb-4">
          {successMsg}
        </Alert>
      )}

      {rules.length === 0 ? (
        <Card className="py-16 text-center">
          <p className="font-sans text-muted-foreground">
            لا توجد قواعد توفر. أضف قاعدة لتبدأ في استقبال المواعيد.
          </p>
        </Card>
      ) : (
        <div className="space-y-3">
          {rules.map((rule) => (
            <Card
              key={rule.id}
              className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center"
            >
              <div className="min-w-0 flex-1">
                <div className="mb-1 flex flex-wrap items-center gap-2">
                  <span className="font-sans font-medium text-foreground">
                    {DAY_LABELS[rule.dayOfWeek]}
                  </span>
                  <span className="font-sans text-sm text-muted-foreground" dir="ltr">
                    {rule.startTime} – {rule.endTime}
                  </span>
                  {rule.branch && <Badge>{rule.branch.name}</Badge>}
                  {isQueueMode(rule.mode) ? (
                    <Badge variant="indigo">
                      {MODE_BADGE_AR[rule.mode]}
                      {rule.dailyCap != null ? ` · حد ${rule.dailyCap}` : ""}
                      {rule.estimatedDurationMin != null
                        ? ` · ~${rule.estimatedDurationMin} د/مريض`
                        : ""}
                    </Badge>
                  ) : (
                    <Badge variant="muted">{rule.slotDurationMin} دقيقة / موعد</Badge>
                  )}
                  <Badge variant={rule.isActive ? "success" : "neutral"}>
                    {rule.isActive ? "نشطة" : "معطّلة"}
                  </Badge>
                  {rule.referralOnly && <Badge variant="warning">تحويلات فقط</Badge>}
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
                <Switch
                  checked={rule.isActive}
                  onCheckedChange={() => handleToggleActive(rule)}
                  disabled={isPending}
                  title={rule.isActive ? "تعطيل" : "تفعيل"}
                  className="data-[state=checked]:bg-emerald-500"
                />

                {/* Queue (order-based) rules need no slot generation — the day
                    is implicitly available and order numbers are handed out on
                    booking, so the generate button is slot-based only. */}
                {!isQueueMode(rule.mode) && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleGenerate(rule.id)}
                    disabled={generatingId === rule.id}
                    title="توليد مواعيد للـ 30 يوم القادمة"
                    className="text-muted-foreground hover:border-primary/50 hover:bg-transparent hover:text-primary [&_svg]:size-3.5"
                  >
                    <Zap />
                    {generatingId === rule.id ? "جارٍ التوليد..." : "توليد مواعيد"}
                  </Button>
                )}

                <Button
                  variant="ghost-destructive"
                  size="icon"
                  onClick={() => handleDelete(rule.id)}
                  disabled={isPending}
                  title="حذف القاعدة"
                >
                  <Trash2 />
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal open={addOpen} onClose={() => setAddOpen(false)} title="إضافة قاعدة توفر">
        <form onSubmit={handleAdd} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FormField
              type="select"
              name="branchId"
              label="الفرع *"
              required
              value={selBranch}
              onValueChange={setSelBranch}
              options={branches.map((b) => ({ value: b.id, label: b.name }))}
              className="sm:col-span-2"
            />
            <FormField
              type="select"
              name="dayOfWeek"
              label="يوم الأسبوع *"
              required
              value={selDay}
              onValueChange={(v) => setSelDay(v as DayOfWeek)}
              options={DAYS_ORDER.map((day) => ({ value: day, label: DAY_LABELS[day] }))}
              className="sm:col-span-2"
              hint={
                branchWindow && (
                  <span className={branchWindow.ok ? undefined : "text-red-600"}>
                    {branchWindow.text}
                  </span>
                )
              }
            />
            <FormField
              type="time"
              name="startTime"
              label="وقت البداية *"
              required
              defaultValue="09:00"
              onValueChange={setSelStart}
            />
            <FormField
              type="time"
              name="endTime"
              label="وقت النهاية *"
              required
              defaultValue="17:00"
              onValueChange={setSelEnd}
            />
            <FormField
              type="select"
              name="mode"
              label="نظام الجدولة"
              value={selMode}
              onValueChange={(v) => setSelMode(v as AvailabilityMode)}
              options={[
                { value: AvailabilityMode.SLOT_BASED, label: "مواعيد بأوقات ثابتة" },
                { value: AvailabilityMode.ORDER_BASED, label: "نظام الدور (طابور)" },
                { value: AvailabilityMode.ARRIVAL_BASED, label: "أسبقية الحضور" },
              ]}
              className="sm:col-span-2"
              hint={
                selMode === AvailabilityMode.ARRIVAL_BASED &&
                "يحجز المريض مكاناً بلا رقم، ويُعطى رقم دوره عند وصوله للعيادة حسب أسبقية الحضور (يسجّل الاستقبال وصوله)."
              }
            />
            {isQueue ? (
              <>
                <FormField
                  type="number"
                  name="estimatedDurationMin"
                  label="دقائق الكشف التقديرية"
                  min={1}
                  defaultValue={10}
                  onValueChange={(v) => setSelEstDur(Number(v))}
                />
                <FormField
                  type="number"
                  name="dailyCap"
                  label="الحد الأقصى للحجوزات"
                  min={1}
                  defaultValue={50}
                  onValueChange={(v) => setSelCap(Number(v))}
                />
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
              <FormField
                type="select"
                name="slotDurationMin"
                label="مدة الموعد"
                defaultValue="30"
                options={[15, 20, 30, 45, 60].map((d) => ({
                  value: String(d),
                  label: `${d} دقيقة`,
                }))}
                className="sm:col-span-2"
              />
            )}
            <FormField
              type="checkbox"
              name="referralOnly"
              label="تحويلات فقط"
              labelClassName="cursor-pointer font-normal"
              hint="لا يحجزها المرضى مباشرةً؛ تُحجز عبر تحويل من طبيب بعد الكشف."
              className="sm:col-span-2"
            />
            <FormField
              name="note"
              label="ملاحظة (اختياري)"
              placeholder="مثال: تحويلات حالات القلب فقط"
              className="sm:col-span-2"
            />
          </div>
          <p className="font-sans text-xs text-muted-foreground">
            سيتم تلقائياً توليد مواعيد الـ 30 يوم القادمة عند الحفظ.
          </p>
          <div className="flex gap-3 pt-2">
            <Button type="submit" loading={isPending} className="flex-1">
              {isPending ? "جارٍ الحفظ..." : "حفظ القاعدة"}
            </Button>
            <Button type="button" variant="outline" onClick={() => setAddOpen(false)}>
              إلغاء
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
