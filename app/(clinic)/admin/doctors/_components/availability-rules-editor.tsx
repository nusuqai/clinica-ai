"use client";

import { useEffect, useState, useTransition } from "react";
import { Plus, Trash2 } from "lucide-react";
import { createRuleAction, deleteRuleAction, getDoctorRulesAction } from "@/server/actions/admin";
import { isQueueMode, MODE_BADGE_AR } from "@/lib/availability/modes";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Alert } from "@/components/ui/alert";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { Hint } from "@/components/ui/tooltip";
import {
  DAY_LABELS,
  RuleFields,
  resetRuleExtras,
  useRuleForm,
  type RuleBranch,
} from "@/components/availability/rule-fields";
import { ruleDraftToFormData, toRuleDraft, type RuleDraft } from "@/lib/validations/availability";

export type EditorBranchHours = RuleBranch["hours"][number];
export type EditorBranch = RuleBranch;
export type { RuleDraft };

type Props =
  | {
      mode: "draft";
      branches: EditorBranch[];
      /** Drafted rules — owned by the parent form, submitted with the doctor. */
      rules: RuleDraft[];
      onRulesChange: (rules: RuleDraft[]) => void;
    }
  | { mode: "live"; doctorId: string; branches: EditorBranch[]; clinicId: string };

/**
 * Inline availability-rules editor embedded in the add/edit doctor modals so
 * schedules can be set without visiting the doctor details page.
 *
 * - "draft" (add): rules are held by the parent form (`rules`/`onRulesChange`)
 *   and the server creates them after the doctor exists.
 * - "live" (edit): the doctor already exists, so each add/remove hits the
 *   server actions immediately and this list stays in sync.
 *
 * The new-rule fields are their own react-hook-form form (see RuleFields), so
 * typing in them never re-renders the rule list or the parent modal.
 */
export default function AvailabilityRulesEditor(props: Props) {
  const { branches } = props;
  const [liveRows, setLiveRows] = useState<RuleDraft[]>([]);
  const [loading, setLoading] = useState(props.mode === "live");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const confirm = useConfirm();
  const form = useRuleForm(branches);

  const rows = props.mode === "draft" ? props.rules : liveRows;
  const doctorId = props.mode === "live" ? props.doctorId : null;

  // Live mode: load the doctor's existing rules once when the editor mounts.
  useEffect(() => {
    if (!doctorId) return;
    let active = true;
    getDoctorRulesAction(doctorId).then((res) => {
      if (!active) return;
      if ("rules" in res && res.rules) setLiveRows(res.rules);
      else if ("error" in res && res.error) setError(res.error);
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [doctorId]);

  // Draft mode: drop drafts whose branch was unselected in the doctor's work-branches above.
  const draftRules = props.mode === "draft" ? props.rules : null;
  const onRulesChange = props.mode === "draft" ? props.onRulesChange : null;
  useEffect(() => {
    if (!draftRules || !onRulesChange) return;
    const kept = draftRules.filter((r) => branches.some((b) => b.id === r.branchId));
    if (kept.length !== draftRules.length) onRulesChange(kept);
  }, [branches, draftRules, onRulesChange]);

  // Not a <form>: this sits inside the doctor modal's form, and forms can't nest.
  const addRow = form.handleSubmit((values) => {
    setError(null);
    const draft = toRuleDraft(values);

    if (props.mode === "draft") {
      props.onRulesChange([...props.rules, draft]);
      resetRuleExtras(form);
      return;
    }

    const id = props.doctorId;
    const fd = ruleDraftToFormData(draft);
    fd.set("doctorId", id);
    startTransition(async () => {
      const res = await createRuleAction(fd, props.clinicId);
      if (res?.error) {
        setError(res.error);
        return;
      }
      const refreshed = await getDoctorRulesAction(id);
      if ("rules" in refreshed && refreshed.rules) setLiveRows(refreshed.rules);
      resetRuleExtras(form);
    });
  });

  async function removeRow(idx: number) {
    const row = rows[idx];
    // Draft rows (and any not yet persisted) just drop from the list.
    if (props.mode === "draft") {
      props.onRulesChange(props.rules.filter((_, i) => i !== idx));
      return;
    }
    if (!row.id) {
      setLiveRows((rs) => rs.filter((_, i) => i !== idx));
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
      setLiveRows((rs) => rs.filter((r) => r.id !== ruleId));
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
                    <Hint label="حذف القاعدة">
                      <Button
                        type="button"
                        variant="ghost-destructive"
                        size="icon"
                        onClick={() => removeRow(idx)}
                        disabled={isPending}
                        aria-label="حذف القاعدة"
                        className="ms-auto"
                      >
                        <Trash2 />
                      </Button>
                    </Hint>
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
            <RuleFields control={form.control} branches={branches} compact />

            <Button type="button" onClick={addRow} disabled={isPending}>
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
