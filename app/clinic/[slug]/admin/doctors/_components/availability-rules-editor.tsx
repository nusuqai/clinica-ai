"use client";

import { useEffect, useState, useTransition } from "react";
import { Plus, Trash2 } from "lucide-react";
import { DayOfWeek, AvailabilityMode } from "@prisma/client";
import { createRuleAction, deleteRuleAction, getDoctorRulesAction } from "@/server/actions/admin";
import { queueCapacityHint } from "@/lib/availability/queue-capacity";

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
  const isOrder = nMode === AvailabilityMode.ORDER_BASED;

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
      estimatedDurationMin: isOrder ? nEstDur : null,
      dailyCap: isOrder ? nCap : null,
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

  function removeRow(idx: number) {
    const row = rows[idx];
    // Draft rows (and any not yet persisted) just drop from local state.
    if (props.mode === "draft" || !row.id) {
      setRows((rs) => rs.filter((_, i) => i !== idx));
      return;
    }
    if (!confirm("سيتم حذف هذه القاعدة والمواعيد المستقبلية غير المحجوزة. هل تريد المتابعة؟"))
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
        <label className="font-sans text-sm font-medium text-foreground">
          قواعد التوفر (المواعيد الأسبوعية)
        </label>
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
            <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 font-sans text-xs text-red-700">
              {error}
            </div>
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
                    <span className="rounded-full bg-primary/10 px-2 py-0.5 font-sans text-xs text-primary">
                      {branchName(rule.branchId)}
                    </span>
                    {rule.mode === AvailabilityMode.ORDER_BASED ? (
                      <span className="rounded-full bg-indigo-100 px-2 py-0.5 font-sans text-xs font-medium text-indigo-700">
                        نظام الدور
                        {rule.dailyCap != null ? ` · حد ${rule.dailyCap}` : ""}
                      </span>
                    ) : (
                      <span className="rounded-full bg-muted px-2 py-0.5 font-sans text-xs text-muted-foreground">
                        {rule.slotDurationMin} دقيقة / موعد
                      </span>
                    )}
                    {rule.referralOnly && (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 font-sans text-xs font-medium text-amber-700">
                        تحويلات فقط
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => removeRow(idx)}
                      disabled={isPending}
                      title="حذف القاعدة"
                      className="ms-auto rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-red-50 hover:text-red-500 disabled:opacity-40"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
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
              <div className="space-y-1 sm:col-span-2">
                <label className="font-sans text-xs font-medium text-muted-foreground">الفرع</label>
                <select
                  value={nBranch}
                  onChange={(e) => setNBranch(e.target.value)}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 font-sans text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                >
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1 sm:col-span-2">
                <label className="font-sans text-xs font-medium text-muted-foreground">
                  يوم الأسبوع
                </label>
                <select
                  value={nDay}
                  onChange={(e) => setNDay(e.target.value as DayOfWeek)}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 font-sans text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                >
                  {DAYS_ORDER.map((day) => (
                    <option key={day} value={day}>
                      {DAY_LABELS[day]}
                    </option>
                  ))}
                </select>
                {dayHint && (
                  <p
                    className={[
                      "mt-1 font-sans text-xs",
                      dayHint.ok ? "text-muted-foreground" : "text-red-600",
                    ].join(" ")}
                  >
                    {dayHint.text}
                  </p>
                )}
              </div>

              <div className="space-y-1">
                <label className="font-sans text-xs font-medium text-muted-foreground">
                  وقت البداية
                </label>
                <input
                  type="time"
                  value={nStart}
                  onChange={(e) => setNStart(e.target.value)}
                  dir="ltr"
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 font-sans text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>

              <div className="space-y-1">
                <label className="font-sans text-xs font-medium text-muted-foreground">
                  وقت النهاية
                </label>
                <input
                  type="time"
                  value={nEnd}
                  onChange={(e) => setNEnd(e.target.value)}
                  dir="ltr"
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 font-sans text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>

              <div className="space-y-1 sm:col-span-2">
                <label className="font-sans text-xs font-medium text-muted-foreground">
                  نظام الجدولة
                </label>
                <select
                  value={nMode}
                  onChange={(e) => setNMode(e.target.value as AvailabilityMode)}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 font-sans text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                >
                  <option value={AvailabilityMode.SLOT_BASED}>مواعيد بأوقات ثابتة</option>
                  <option value={AvailabilityMode.ORDER_BASED}>نظام الدور (طابور)</option>
                </select>
              </div>

              {isOrder ? (
                <>
                  <div className="space-y-1">
                    <label className="font-sans text-xs font-medium text-muted-foreground">
                      دقائق الكشف التقديرية
                    </label>
                    <input
                      type="number"
                      min={1}
                      value={nEstDur}
                      onChange={(e) => setNEstDur(Number(e.target.value))}
                      className="w-full rounded-lg border border-border bg-background px-3 py-2 font-sans text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="font-sans text-xs font-medium text-muted-foreground">
                      الحد الأقصى للحجوزات
                    </label>
                    <input
                      type="number"
                      min={1}
                      value={nCap}
                      onChange={(e) => setNCap(Number(e.target.value))}
                      className="w-full rounded-lg border border-border bg-background px-3 py-2 font-sans text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                    />
                  </div>
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
                <div className="space-y-1 sm:col-span-2">
                  <label className="font-sans text-xs font-medium text-muted-foreground">
                    مدة الموعد
                  </label>
                  <select
                    value={nDur}
                    onChange={(e) => setNDur(Number(e.target.value))}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 font-sans text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                  >
                    {SLOT_DURATIONS.map((d) => (
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
                  checked={nReferralOnly}
                  onChange={(e) => setNReferralOnly(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-border text-primary focus:ring-primary/30"
                />
                <span className="font-sans text-xs text-foreground">
                  تحويلات فقط
                  <span className="block text-muted-foreground">
                    لا يحجزها المرضى مباشرةً؛ تُحجز عبر تحويل من طبيب بعد الكشف.
                  </span>
                </span>
              </label>

              <div className="space-y-1 sm:col-span-2">
                <label className="font-sans text-xs font-medium text-muted-foreground">
                  ملاحظة (اختياري)
                </label>
                <input
                  type="text"
                  value={nNote}
                  onChange={(e) => setNNote(e.target.value)}
                  placeholder="مثال: تحويلات حالات القلب فقط"
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 font-sans text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>
            </div>

            <button
              type="button"
              onClick={addRow}
              disabled={!canAdd}
              className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 font-sans text-sm font-medium text-white transition-colors hover:bg-primary/90 disabled:opacity-50"
            >
              <Plus className="h-4 w-4" />
              {props.mode === "live" && isPending ? "جارٍ الإضافة..." : "إضافة قاعدة"}
            </button>
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
