"use client";

import { useEffect, useState, useTransition } from "react";
import { Plus, Trash2 } from "lucide-react";
import { DayOfWeek } from "@prisma/client";
import {
  createRuleAction,
  deleteRuleAction,
  getDoctorRulesAction,
} from "@/server/actions/admin";

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
  day: DayOfWeek,
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
  | { mode: "live"; doctorId: string; branches: EditorBranch[] };

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
    setNBranch((cur) =>
      branches.some((b) => b.id === cur) ? cur : (branches[0]?.id ?? ""),
    );
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
    };

    if (props.mode === "draft") {
      setRows((rs) => [...rs, draft]);
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
    startTransition(async () => {
      const res = await createRuleAction(fd);
      if (res?.error) {
        setError(res.error);
        return;
      }
      const refreshed = await getDoctorRulesAction(id);
      if ("rules" in refreshed && refreshed.rules) setRows(refreshed.rules);
    });
  }

  function removeRow(idx: number) {
    const row = rows[idx];
    // Draft rows (and any not yet persisted) just drop from local state.
    if (props.mode === "draft" || !row.id) {
      setRows((rs) => rs.filter((_, i) => i !== idx));
      return;
    }
    if (
      !confirm(
        "سيتم حذف هذه القاعدة والمواعيد المستقبلية غير المحجوزة. هل تريد المتابعة؟",
      )
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

  const branchName = (id: string) =>
    branches.find((b) => b.id === id)?.name ?? "فرع غير محدد";

  return (
    <div className="space-y-3 border-t border-border pt-4">
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium text-foreground font-sans">
          قواعد التوفر (المواعيد الأسبوعية)
        </label>
        <span className="text-xs text-muted-foreground font-sans">
          {rows.length} قاعدة
        </span>
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
            })),
          )}
        />
      )}

      {branches.length === 0 ? (
        <p className="text-xs text-muted-foreground font-sans">
          اختر فرعاً واحداً على الأقل لفروع عمل الطبيب أعلاه
          {props.mode === "live" ? " واحفظ التعديلات" : ""} لتتمكّن من إضافة قواعد
          التوفر.
        </p>
      ) : (
        <>
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-3 py-2 text-xs font-sans">
              {error}
            </div>
          )}

          {/* Existing / drafted rules */}
          {loading ? (
            <p className="text-xs text-muted-foreground font-sans">جارٍ التحميل...</p>
          ) : rows.length === 0 ? (
            <p className="text-xs text-muted-foreground font-sans">
              لا توجد قواعد بعد. أضف قاعدة بالأسفل.
            </p>
          ) : (
            <div className="space-y-2">
              {rows.map((rule, idx) => (
                <div
                  key={rule.id ?? idx}
                  className="flex flex-wrap items-center gap-2 bg-muted/40 border border-border rounded-xl px-3 py-2"
                >
                  <span className="font-medium text-foreground font-sans text-sm">
                    {DAY_LABELS[rule.dayOfWeek]}
                  </span>
                  <span className="text-muted-foreground font-sans text-sm" dir="ltr">
                    {rule.startTime} – {rule.endTime}
                  </span>
                  <span className="text-xs text-primary font-sans bg-primary/10 px-2 py-0.5 rounded-full">
                    {branchName(rule.branchId)}
                  </span>
                  <span className="text-xs text-muted-foreground font-sans bg-muted px-2 py-0.5 rounded-full">
                    {rule.slotDurationMin} دقيقة / موعد
                  </span>
                  <button
                    type="button"
                    onClick={() => removeRow(idx)}
                    disabled={isPending}
                    title="حذف القاعدة"
                    className="ms-auto p-1.5 rounded-lg text-muted-foreground hover:text-red-500 hover:bg-red-50 transition-colors disabled:opacity-40"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* New rule row */}
          <div className="bg-card border border-dashed border-border rounded-xl p-3 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1 sm:col-span-2">
                <label className="text-xs font-medium text-muted-foreground font-sans">
                  الفرع
                </label>
                <select
                  value={nBranch}
                  onChange={(e) => setNBranch(e.target.value)}
                  className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background text-foreground font-sans focus:outline-none focus:ring-2 focus:ring-primary/30"
                >
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1 sm:col-span-2">
                <label className="text-xs font-medium text-muted-foreground font-sans">
                  يوم الأسبوع
                </label>
                <select
                  value={nDay}
                  onChange={(e) => setNDay(e.target.value as DayOfWeek)}
                  className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background text-foreground font-sans focus:outline-none focus:ring-2 focus:ring-primary/30"
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
                      "text-xs font-sans mt-1",
                      dayHint.ok ? "text-muted-foreground" : "text-red-600",
                    ].join(" ")}
                  >
                    {dayHint.text}
                  </p>
                )}
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground font-sans">
                  وقت البداية
                </label>
                <input
                  type="time"
                  value={nStart}
                  onChange={(e) => setNStart(e.target.value)}
                  dir="ltr"
                  className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background text-foreground font-sans focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground font-sans">
                  وقت النهاية
                </label>
                <input
                  type="time"
                  value={nEnd}
                  onChange={(e) => setNEnd(e.target.value)}
                  dir="ltr"
                  className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background text-foreground font-sans focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>

              <div className="space-y-1 sm:col-span-2">
                <label className="text-xs font-medium text-muted-foreground font-sans">
                  مدة الموعد
                </label>
                <select
                  value={nDur}
                  onChange={(e) => setNDur(Number(e.target.value))}
                  className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background text-foreground font-sans focus:outline-none focus:ring-2 focus:ring-primary/30"
                >
                  {SLOT_DURATIONS.map((d) => (
                    <option key={d} value={d}>
                      {d} دقيقة
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <button
              type="button"
              onClick={addRow}
              disabled={!canAdd}
              className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-xl text-sm font-medium font-sans hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              <Plus className="w-4 h-4" />
              {props.mode === "live" && isPending ? "جارٍ الإضافة..." : "إضافة قاعدة"}
            </button>
          </div>

          {props.mode === "draft" && rows.length > 0 && (
            <p className="text-xs text-muted-foreground font-sans">
              سيتم توليد مواعيد الـ 30 يوماً القادمة تلقائياً عند حفظ الطبيب.
            </p>
          )}
        </>
      )}
    </div>
  );
}
