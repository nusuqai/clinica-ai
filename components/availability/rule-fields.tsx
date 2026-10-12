"use client";

import { useEffect } from "react";
import { useForm, useWatch, type Control, type UseFormReturn } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { AvailabilityMode, DayOfWeek } from "@prisma/client";

import { cn } from "@/lib/utils";
import { FormField } from "@/components/ui/form-field";
import { isQueueMode } from "@/lib/availability/modes";
import { queueCapacityHint } from "@/lib/availability/queue-capacity";
import {
  ruleFormDefaults,
  ruleFormSchema,
  type RuleFormInput,
  type RuleFormValues,
} from "@/lib/validations/availability";

export interface RuleBranch {
  id: string;
  name: string;
  hours: {
    dayOfWeek: DayOfWeek;
    isClosed: boolean;
    openTime: string | null;
    closeTime: string | null;
  }[];
}

export const DAY_LABELS: Record<DayOfWeek, string> = {
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
const DAY_OPTIONS = DAYS_ORDER.map((day) => ({ value: day, label: DAY_LABELS[day] }));
const DURATION_OPTIONS = [15, 20, 30, 45, 60].map((d) => ({
  value: String(d),
  label: `${d} دقيقة`,
}));
const MODE_OPTIONS = [
  { value: AvailabilityMode.SLOT_BASED, label: "مواعيد بأوقات ثابتة" },
  { value: AvailabilityMode.ORDER_BASED, label: "نظام الدور (طابور)" },
  { value: AvailabilityMode.ARRIVAL_BASED, label: "أسبقية الحضور" },
];

type RuleControl = Control<RuleFormInput, unknown, RuleFormValues>;
export type RuleForm = UseFormReturn<RuleFormInput, unknown, RuleFormValues>;

/**
 * The rule form for a branch list. Keeps the selected branch valid when the
 * list changes (e.g. the add-doctor modal's work branches are re-picked).
 */
export function useRuleForm(branches: RuleBranch[]): RuleForm {
  const form = useForm<RuleFormInput, unknown, RuleFormValues>({
    resolver: zodResolver(ruleFormSchema),
    defaultValues: ruleFormDefaults(branches[0]?.id),
    mode: "onTouched",
  });

  const { getValues, setValue } = form;
  useEffect(() => {
    const current = getValues("branchId");
    if (!branches.some((b) => b.id === current)) setValue("branchId", branches[0]?.id ?? "");
  }, [branches, getValues, setValue]);

  return form;
}

/** Clear the per-rule extras after a rule is added, keeping branch/day/times for the next one. */
export function resetRuleExtras(form: RuleForm) {
  form.setValue("referralOnly", false);
  form.setValue("note", "");
  form.setValue("mode", AvailabilityMode.SLOT_BASED);
}

/** The branch's opening window for a weekday, as a helper hint + validity flag. */
function branchWindow(branches: RuleBranch[], branchId: string, day: DayOfWeek) {
  const branch = branches.find((b) => b.id === branchId);
  if (!branch) return null;
  const row = branch.hours.find((h) => h.dayOfWeek === day);
  if (!row) return { text: "لم تُحدَّد ساعات لهذا الفرع في هذا اليوم (سيُسمح بأي وقت).", ok: true };
  if (row.isClosed) return { text: "الفرع مغلق في هذا اليوم.", ok: false };
  if (row.openTime && row.closeTime)
    return { text: `ساعات عمل الفرع: ${row.openTime} – ${row.closeTime}`, ok: true };
  return { text: "ساعات هذا اليوم غير مكتملة.", ok: true };
}

/**
 * Fields of one availability rule. Each hint is its own component watching
 * only the values it needs, so typing re-renders the field, not the form.
 *
 * `compact` is the smaller-label variant used inside the doctor modals.
 */
export function RuleFields({
  control,
  branches,
  compact = false,
}: {
  control: RuleControl;
  branches: RuleBranch[];
  compact?: boolean;
}) {
  const labelClassName = compact ? "text-xs text-muted-foreground" : undefined;
  const req = compact ? "" : " *";

  return (
    <div className={cn("grid grid-cols-1 sm:grid-cols-2", compact ? "gap-3" : "gap-4")}>
      <FormField
        control={control}
        name="branchId"
        type="select"
        label={`الفرع${req}`}
        labelClassName={labelClassName}
        options={branches.map((b) => ({ value: b.id, label: b.name }))}
        className="sm:col-span-2"
      />

      <FormField
        control={control}
        name="dayOfWeek"
        type="select"
        label={`يوم الأسبوع${req}`}
        labelClassName={labelClassName}
        options={DAY_OPTIONS}
        className="sm:col-span-2"
        hint={<BranchWindowHint control={control} branches={branches} />}
      />

      <FormField
        control={control}
        name="startTime"
        type="time"
        label={`وقت البداية${req}`}
        labelClassName={labelClassName}
      />
      <FormField
        control={control}
        name="endTime"
        type="time"
        label={`وقت النهاية${req}`}
        labelClassName={labelClassName}
      />

      <ModeFields control={control} labelClassName={labelClassName} compact={compact} />

      <FormField
        control={control}
        name="referralOnly"
        type="checkbox"
        label="تحويلات فقط"
        labelClassName={cn("cursor-pointer font-normal", compact && "text-xs")}
        hint="لا يحجزها المرضى مباشرةً؛ تُحجز عبر تحويل من طبيب بعد الكشف."
        className="sm:col-span-2"
      />

      <FormField
        control={control}
        name="note"
        label="ملاحظة (اختياري)"
        labelClassName={labelClassName}
        placeholder="مثال: تحويلات حالات القلب فقط"
        className="sm:col-span-2"
      />
    </div>
  );
}

function BranchWindowHint({ control, branches }: { control: RuleControl; branches: RuleBranch[] }) {
  const [branchId, day] = useWatch({ control, name: ["branchId", "dayOfWeek"] });
  const hint = branchWindow(branches, branchId, day);
  if (!hint) return null;
  return <span className={hint.ok ? undefined : "text-red-600"}>{hint.text}</span>;
}

/** Mode picker plus the fields that depend on it (queue estimate/cap, or slot duration). */
function ModeFields({
  control,
  labelClassName,
  compact,
}: {
  control: RuleControl;
  labelClassName?: string;
  compact: boolean;
}) {
  const mode = useWatch({ control, name: "mode" });
  return (
    <>
      <FormField
        control={control}
        name="mode"
        type="select"
        label="نظام الجدولة"
        labelClassName={labelClassName}
        options={MODE_OPTIONS}
        className="sm:col-span-2"
        hint={
          mode === AvailabilityMode.ARRIVAL_BASED &&
          "يحجز المريض مكاناً بلا رقم، ويُعطى رقم دوره عند وصوله للعيادة حسب أسبقية الحضور (يسجّل الاستقبال وصوله)."
        }
      />

      {isQueueMode(mode) ? (
        <>
          <FormField
            control={control}
            name="estimatedDurationMin"
            type="number"
            label="دقائق الكشف التقديرية"
            labelClassName={labelClassName}
            min={1}
          />
          <FormField
            control={control}
            name="dailyCap"
            type="number"
            label="الحد الأقصى للحجوزات"
            labelClassName={labelClassName}
            min={1}
          />
          <CapacityHint control={control} compact={compact} />
        </>
      ) : (
        <FormField
          control={control}
          name="slotDurationMin"
          type="select"
          label="مدة الموعد"
          labelClassName={labelClassName}
          options={DURATION_OPTIONS}
          className="sm:col-span-2"
        />
      )}
    </>
  );
}

function CapacityHint({ control, compact }: { control: RuleControl; compact: boolean }) {
  const [start, end, estDur, cap] = useWatch({
    control,
    name: ["startTime", "endTime", "estimatedDurationMin", "dailyCap"],
  });
  const hint = queueCapacityHint(start, end, Number(estDur), Number(cap));
  if (!hint) return null;
  return (
    <p
      className={cn(
        "px-3 py-2 font-sans sm:col-span-2",
        compact ? "rounded-lg text-xs" : "rounded-xl text-sm",
        hint.tone === "warn"
          ? "border border-amber-200 bg-amber-50 text-amber-800"
          : "border border-emerald-200 bg-emerald-50 text-emerald-800"
      )}
    >
      {hint.text}
    </p>
  );
}
