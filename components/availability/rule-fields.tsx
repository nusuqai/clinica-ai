"use client";

import { useEffect } from "react";
import {
  useController,
  useForm,
  useWatch,
  type Control,
  type UseFormReturn,
} from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { AvailabilityMode, DayOfWeek, QueueCapType } from "@prisma/client";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";

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

const CAP_OPTIONS = [
  { value: QueueCapType.NONE, label: "بدون حد" },
  { value: QueueCapType.PATIENTS, label: "عدد المرضى" },
  { value: QueueCapType.MINUTES, label: "إجمالي الدقائق" },
];

/** A service the rule can be limited to (the doctor's own services). */
export interface RuleServiceOption {
  id: string;
  name: string;
}

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
  form.setValue("serviceIds", []);
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
  services,
  compact = false,
}: {
  control: RuleControl;
  branches: RuleBranch[];
  /** The doctor's services; when given, the rule can be limited to some of them. */
  services?: RuleServiceOption[];
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

      {services && services.length > 0 && (
        <RuleServicesField control={control} services={services} compact={compact} />
      )}

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
          mode === AvailabilityMode.ORDER_BASED
            ? "بمجرد أن يحجز المريض يحصل على رقم دوره، ونُخبره بالوقت المتوقع لكشفه تقريباً، ويمكنه متابعة كم تبقّى على دوره من خلالنا."
            : mode === AvailabilityMode.ARRIVAL_BASED &&
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
            name="capType"
            type="select"
            label="الحد اليومي"
            labelClassName={labelClassName}
            options={CAP_OPTIONS}
            hint="بالدقائق: يتوقف الحجز عندما يمتلئ اليوم بمدد الخدمات المحجوزة."
          />
          <CapFields control={control} labelClassName={labelClassName} compact={compact} />
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

/** The cap's number (patients or minutes), per the chosen cap type. */
function CapFields({
  control,
  labelClassName,
  compact,
}: {
  control: RuleControl;
  labelClassName?: string;
  compact: boolean;
}) {
  const capType = useWatch({ control, name: "capType" });
  if (capType === QueueCapType.PATIENTS)
    return (
      <>
        <FormField
          control={control}
          name="dailyCap"
          type="number"
          label="الحد الأقصى للحجوزات"
          labelClassName={labelClassName}
          min={1}
          className="sm:col-span-2"
        />
        <CapacityHint control={control} compact={compact} />
      </>
    );
  if (capType === QueueCapType.MINUTES)
    return (
      <FormField
        control={control}
        name="dailyCapMinutes"
        type="number"
        label="الحد الأقصى بالدقائق"
        labelClassName={labelClassName}
        min={1}
        className="sm:col-span-2"
        hint="مجموع مدد الخدمات المحجوزة في اليوم لا يتجاوز هذا الرقم."
      />
    );
  return null;
}

/** "All the doctor's services" or a hand-picked subset for this rule. */
function RuleServicesField({
  control,
  services,
  compact,
}: {
  control: RuleControl;
  services: RuleServiceOption[];
  compact: boolean;
}) {
  const { field } = useController({ control, name: "serviceIds" });
  const selected: string[] = field.value ?? [];
  const limited = selected.length > 0;
  return (
    <div className="space-y-2 rounded-xl border border-border p-3 sm:col-span-2">
      <Label
        className={cn("font-sans font-medium text-foreground", compact ? "text-xs" : "text-sm")}
      >
        الخدمات المتاحة في هذا الموعد
      </Label>
      <p className="font-sans text-xs text-muted-foreground">
        {limited
          ? "يمكن حجز الخدمات المختارة فقط في هذه الفترة."
          : "كل خدمات الطبيب متاحة. اختر خدمات بعينها لتقصر هذه الفترة عليها (مثال: يوم الليزر)."}
      </p>
      <div className="flex flex-wrap gap-x-5 gap-y-2">
        {services.map((s) => (
          <label
            key={s.id}
            className="flex cursor-pointer items-center gap-2 font-sans text-sm text-foreground"
          >
            <Checkbox
              checked={selected.includes(s.id)}
              onCheckedChange={(c) =>
                field.onChange(
                  c === true ? [...selected, s.id] : selected.filter((id) => id !== s.id)
                )
              }
            />
            {s.name}
          </label>
        ))}
      </div>
    </div>
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
