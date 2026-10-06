"use client";

import { useEffect, useState, useTransition } from "react";
import { Plus, Trash2 } from "lucide-react";
import { DayOfWeek, AvailabilityMode } from "@prisma/client";
import { createRuleAction, deleteRuleAction, getDoctorRulesAction } from "@/server/actions/admin";
import { queueCapacityHint } from "@/lib/availability/queue-capacity";
import { isQueueMode, MODE_BADGE_AR } from "@/lib/availability/modes";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Label } from "@/components/ui/label";
import { Alert } from "@/components/ui/alert";
import { useConfirm } from "@/components/ui/confirm-dialog";

export interface EditorBranchHours {
  dayOfWeek: DayOfWeek;
  isClosed: boolean;
  openTime: string | null;
  closeTime: string | null;
}
export interface EditorBranch {
  id: string;
  name: string;
  hours: EditorBranchHours[];
}
export interface RuleDraft {
  /** Present only for rules that already exist in the DB (live/edit mode). */
  id?: string;
  branchId: string;
  dayOfWeek: DayOfWeek;
  startTime: string;
  endTime: string;
  slotDurationMin: number;
  /** SLOT_BASED (fixed times) or ORDER_BASED (queue). */
  mode: AvailabilityMode;
  /** Order-based: estimated minutes per patient. */
  estimatedDurationMin: number | null;
  /** Order-based: max bookings per day. */
  dailyCap: number | null;
  /** Referral-only rules aren't bookable by patients directly. */
  referralOnly: boolean;
  note: string | null;
}

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

const SLOT_DURATIONS = [15, 20, 30, 45, 60];

const DAY_OPTIONS = DAYS_ORDER.map((day) => ({ value: day, label: DAY_LABELS[day] }));
const DURATION_OPTIONS = SLOT_DURATIONS.map((d) => ({ value: String(d), label: `${d} دقيقة` }));
const MODE_OPTIONS = [
  { value: AvailabilityMode.SLOT_BASED, label: "مواعيد بأوقات ثابتة" },
  { value: AvailabilityMode.ORDER_BASED, label: "نظام الدور (طابور)" },
  { value: AvailabilityMode.ARRIVAL_BASED, label: "أسبقية الحضور" },
];

/** Compact label for the new-rule row. */
const smallLabel = "text-xs text-muted-foreground";

/** The branch's opening window for a weekday, as a helper hint + validity flag. */
function branchWindow(
  branches: EditorBranch[],
  branchId: string,
  day: DayOfWeek
): { text: string; ok: boolean } | null {
  const branch = branches.find((b) => b.id === branchId);
  if (!branch) return null;
  const row = branch.hours.find((h) => h.dayOfWeek === day);
  if (!row)
    return {
      text: "لم تُحدَّد ساعات لهذا الفرع في هذا اليوم (سيُسمح بأي وقت).",
      ok: true,
    };
  if (row.isClosed) return { text: "الفرع مغلق في هذا اليوم.", ok: false };
  if (row.openTime && row.closeTime)
    return { text: `ساعات عمل الفرع: ${row.openTime} – ${row.closeTime}`, ok: true };
  return { text: "ساعات هذا اليوم غير مكتملة.", ok: true };
}

type Props =
  | { mode: "draft"; branches: EditorBranch[] }
  | { mode: "live"; doctorId: string; branches: EditorBranch[]; clinicId: string };

/**
 * Inline availability-rules editor embedded in the add/edit doctor modals so
 * schedules can be set without visiting the doctor details page.
 *
 * - "draft" (add): rules are held in local state and serialized into a hidden
 *   `rules` input; the parent form submits them and the server creates them
 *   after the doctor exists.
 * - "live" (edit): the doctor already exists, so each add/remove hits the
 *   server actions immediately and this list stays in sync.
 */
export default function AvailabilityRulesEditor(props: Props) {
  const { branches } = props;
  const [rows, setRows] = useState<RuleDraft[]>([]);
  const [loading, setLoading] = useState(props.mode === "live");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const confirm = useConfirm();

  // "New rule" row — controlled so it never participates in the parent form.
  const [nBranch, setNBranch] = useState(branches[0]?.id ?? "");
  const [nDay, setNDay] = useState<DayOfWeek>(DayOfWeek.SAT);
  const [nStart, setNStart] = useState("09:00");
  const [nEnd, setNEnd] = useState("17:00");
  const [nDur, setNDur] = useState(30);
  const [nReferralOnly, setNReferralOnly] = useState(false);
  const [nNote, setNNote] = useState("");
  const [nMode, setNMode] = useState<AvailabilityMode>(AvailabilityMode.SLOT_BASED);
  const [nEstDur, setNEstDur] = useState(10);
  const [nCap, setNCap] = useState(50);
  // Both queue modes (نظام الدور / أسبقية الحضور) use the estimate + cap fields.
  const isQueue = isQueueMode(nMode);

  const doctorId = props.mode === "live" ? props.doctorId : null;

  // Live mode: load the doctor's existing rules once when the editor mounts.
  useEffect(() => {
    if (!doctorId) return;
    let active = true;
    getDoctorRulesAction(doctorId).then((res) => {
      if (!active) return;
      if ("rules" in res && res.rules) setRows(res.rules);
      else if ("error" in res && res.error) setError(res.error);
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [doctorId]);

  // Draft mode: keep the new-rule branch valid and drop drafts whose branch was
  // unselected in the doctor's work-branches above.
  useEffect(() => {
    if (props.mode !== "draft") return;
    setRows((rs) => rs.filter((r) => branches.some((b) => b.id === r.branchId)));
    setNBranch((cur) => (branches.some((b) => b.id === cur) ? cur : (branches[0]?.id ?? "")));
  }, [branches, props.mode]);

  const dayHint = branchWindow(branches, nBranch, nDay);
  const canAdd = !!nBranch && nEnd > nStart && !isPending;

  function addRow() {
    setError(null);
    if (!nBranch) {
      setError("اختر الفرع لهذه القاعدة.");
      return;
    }
    if (nEnd <= nStart) {
      setError("وقت النهاية يجب أن يكون بعد وقت البداية.");
      return;
    }
    const draft: RuleDraft = {
      branchId: nBranch,
      dayOfWeek: nDay,
      startTime: nStart,
      endTime: nEnd,
      slotDurationMin: nDur,
      mode: nMode,
      estimatedDurationMin: isQueue ? nEstDur : null,
      dailyCap: isQueue ? nCap : null,
      referralOnly: nReferralOnly,
      note: nNote.trim() || null,
    };

    function resetExtras() {
      setNReferralOnly(false);
      setNNote("");
      setNMode(AvailabilityMode.SLOT_BASED);
    }

    if (props.mode === "draft") {
      setRows((rs) => [...rs, draft]);
      resetExtras();
      return;
    }

    const id = props.doctorId;
    const fd = new FormData();
    fd.set("doctorId", id);
    fd.set("branchId", draft.branchId);
    fd.set("dayOfWeek", draft.dayOfWeek);
    fd.set("startTime", draft.startTime);
    fd.set("endTime", draft.endTime);
    fd.set("slotDurationMin", String(draft.slotDurationMin));
    fd.set("mode", draft.mode);
    if (draft.estimatedDurationMin != null)
      fd.set("estimatedDurationMin", String(draft.estimatedDurationMin));
    if (draft.dailyCap != null) fd.set("dailyCap", String(draft.dailyCap));
    if (draft.referralOnly) fd.set("referralOnly", "on");
    if (draft.note) fd.set("note", draft.note);
    startTransition(async () => {
      const res = await createRuleAction(fd, props.clinicId);
      if (res?.error) {
        setError(res.error);
        return;
      }
      const refreshed = await getDoctorRulesAction(id);
      if ("rules" in refreshed && refreshed.rules) setRows(refreshed.rules);
      resetExtras();
    });
  }

  async function removeRow(idx: number) {
    const row = rows[idx];
    // Draft rows (and any not yet persisted) just drop from local state.
    if (props.mode === "draft" || !row.id) {
      setRows((rs) => rs.filter((_, i) => i !== idx));
      return;
    }
    if (
      !(await confirm({
        title: "حذف القاعدة",
        description: "سيتم حذف هذه القاعدة والمواعيد المستقبلية غير المحجوزة. هل تريد المتابعة؟",
      }))
    )
      return;
    const ruleId = row.id;
    setError(null);
    startTransition(async () => {
      const res = await deleteRuleAction(ruleId, props.doctorId);
      if (res?.error) {
        setError(res.error);
        return;
      }
      setRows((rs) => rs.filter((r) => r.id !== ruleId));
    });
  }

  const branchName = (id: string) => branches.find((b) => b.id === id)?.name ?? "فرع غير محدد";

  return (
    <div className="space-y-3 border-t border-border pt-4">
      <div className="flex items-center justify-between">
        <Label className="font-sans text-sm font-medium text-foreground">
          قواعد التوفر (المواعيد الأسبوعية)
        </Label>
        <span className="font-sans text-xs text-muted-foreground">{rows.length} قاعدة</span>
      </div>

      {props.mode === "draft" && (
        <input
          type="hidden"
          name="rules"
          value={JSON.stringify(
            rows.map((r) => ({
              branchId: r.branchId,
              dayOfWeek: r.dayOfWeek,
              startTime: r.startTime,
              endTime: r.endTime,
              slotDurationMin: r.slotDurationMin,
              mode: r.mode,
              estimatedDurationMin: r.estimatedDurationMin,
              dailyCap: r.dailyCap,
              referralOnly: r.referralOnly,
              note: r.note,
            }))
          )}
        />
      )}

      {branches.length === 0 ? (
        <p className="font-sans text-xs text-muted-foreground">
          اختر فرعاً واحداً على الأقل لفروع عمل الطبيب أعلاه
          {props.mode === "live" ? " واحفظ التعديلات" : ""} لتتمكّن من إضافة قواعد التوفر.
        </p>
      ) : (
        <>
          {error && (
            <Alert variant="destructive" className="px-3 py-2 text-xs">
              {error}
            </Alert>
          )}

          {/* Existing / drafted rules */}
          {loading ? (
            <p className="font-sans text-xs text-muted-foreground">جارٍ التحميل...</p>
          ) : rows.length === 0 ? (
            <p className="font-sans text-xs text-muted-foreground">
              لا توجد قواعد بعد. أضف قاعدة بالأسفل.
            </p>
          ) : (
            <div className="space-y-2">
              {rows.map((rule, idx) => (
                <div
                  key={rule.id ?? idx}
                  className="rounded-xl border border-border bg-muted/40 px-3 py-2"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-sans text-sm font-medium text-foreground">
                      {DAY_LABELS[rule.dayOfWeek]}
                    </span>
                    <span className="font-sans text-sm text-muted-foreground" dir="ltr">
                      {rule.startTime} – {rule.endTime}
                    </span>
                    <Badge>{branchName(rule.branchId)}</Badge>
                    {isQueueMode(rule.mode) ? (
                      <Badge variant="indigo">
                        {MODE_BADGE_AR[rule.mode]}
                        {rule.dailyCap != null ? ` · حد ${rule.dailyCap}` : ""}
                      </Badge>
                    ) : (
                      <Badge variant="muted">{rule.slotDurationMin} دقيقة / موعد</Badge>
                    )}
                    {rule.referralOnly && <Badge variant="warning">تحويلات فقط</Badge>}
                    <Button
                      type="button"
                      variant="ghost-destructive"
                      size="icon"
                      onClick={() => removeRow(idx)}
                      disabled={isPending}
                      title="حذف القاعدة"
                      className="ms-auto"
                    >
                      <Trash2 />
                    </Button>
                  </div>
                  {rule.note && (
                    <p className="mt-1 font-sans text-xs text-muted-foreground">{rule.note}</p>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* New rule row */}
          <div className="space-y-3 rounded-xl border border-dashed border-border bg-card p-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <FormField
                type="select"
                label="الفرع"
                labelClassName={smallLabel}
                value={nBranch}
                onValueChange={setNBranch}
                options={branches.map((b) => ({ value: b.id, label: b.name }))}
                className="sm:col-span-2"
              />

              <FormField
                type="select"
                label="يوم الأسبوع"
                labelClassName={smallLabel}
                value={nDay}
                onValueChange={(v) => setNDay(v as DayOfWeek)}
                options={DAY_OPTIONS}
                className="sm:col-span-2"
                hint={
                  dayHint && (
                    <span className={dayHint.ok ? undefined : "text-red-600"}>{dayHint.text}</span>
                  )
                }
              />

              <FormField
                type="time"
                label="وقت البداية"
                labelClassName={smallLabel}
                value={nStart}
                onValueChange={setNStart}
              />

              <FormField
                type="time"
                label="وقت النهاية"
                labelClassName={smallLabel}
                value={nEnd}
                onValueChange={setNEnd}
              />

              <FormField
                type="select"
                label="نظام الجدولة"
                labelClassName={smallLabel}
                value={nMode}
                onValueChange={(v) => setNMode(v as AvailabilityMode)}
                options={MODE_OPTIONS}
                className="sm:col-span-2"
                hint={
                  nMode === AvailabilityMode.ARRIVAL_BASED &&
                  "يحجز المريض مكاناً بلا رقم، ويُعطى رقم دوره عند وصوله للعيادة حسب أسبقية الحضور (يسجّل الاستقبال وصوله)."
                }
              />

              {isQueue ? (
                <>
                  <FormField
                    type="number"
                    label="دقائق الكشف التقديرية"
                    labelClassName={smallLabel}
                    min={1}
                    value={nEstDur}
                    onValueChange={(v) => setNEstDur(Number(v))}
                  />
                  <FormField
                    type="number"
                    label="الحد الأقصى للحجوزات"
                    labelClassName={smallLabel}
                    min={1}
                    value={nCap}
                    onValueChange={(v) => setNCap(Number(v))}
                  />
                  {(() => {
                    const hint = queueCapacityHint(nStart, nEnd, nEstDur, nCap);
                    if (!hint) return null;
                    return (
                      <p
                        className={`rounded-lg px-3 py-2 font-sans text-xs sm:col-span-2 ${
                          hint.tone === "warn"
                            ? "border border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200"
                            : "border border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200"
                        }`}
                      >
                        {hint.text}
                      </p>
                    );
                  })()}
                </>
              ) : (
                <FormField
                  type="select"
                  label="مدة الموعد"
                  labelClassName={smallLabel}
                  value={String(nDur)}
                  onValueChange={(v) => setNDur(Number(v))}
                  options={DURATION_OPTIONS}
                  className="sm:col-span-2"
                />
              )}

              <FormField
                type="checkbox"
                label="تحويلات فقط"
                labelClassName="cursor-pointer text-xs font-normal"
                hint="لا يحجزها المرضى مباشرةً؛ تُحجز عبر تحويل من طبيب بعد الكشف."
                checked={nReferralOnly}
                onCheckedChange={setNReferralOnly}
                className="sm:col-span-2"
              />

              <FormField
                label="ملاحظة (اختياري)"
                labelClassName={smallLabel}
                value={nNote}
                onValueChange={setNNote}
                placeholder="مثال: تحويلات حالات القلب فقط"
                className="sm:col-span-2"
              />
            </div>

            <Button type="button" onClick={addRow} disabled={!canAdd}>
              <Plus />
              {props.mode === "live" && isPending ? "جارٍ الإضافة..." : "إضافة قاعدة"}
            </Button>
          </div>

          {props.mode === "draft" && rows.length > 0 && (
            <p className="font-sans text-xs text-muted-foreground">
              سيتم توليد مواعيد الـ 30 يوماً القادمة تلقائياً عند حفظ الطبيب.
            </p>
          )}
        </>
      )}
    </div>
  );
}
