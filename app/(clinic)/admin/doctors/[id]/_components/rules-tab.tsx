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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { DayOfWeek, type AvailabilityRule } from "@prisma/client";
import { formatSlotDate } from "@/lib/slot-time";
import { isQueueMode, MODE_BADGE_AR } from "@/lib/availability/modes";
import { Card } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { Hint } from "@/components/ui/tooltip";
import { RuleFields, useRuleForm } from "@/components/availability/rule-fields";
import { ruleDraftToFormData, ruleFormDefaults, toRuleDraft } from "@/lib/validations/availability";

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

interface RulesTabProps {
  doctorId: string;
  rules: RuleRow[];
  branches: DoctorBranchOption[];
  clinicId: string;
}

export default function RulesTab({ doctorId, rules, branches, clinicId }: RulesTabProps) {
  const router = useRouter();
  const [addOpen, setAddOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const confirm = useConfirm();
  const [generatingId, setGeneratingId] = useState<string | null>(null);
  const form = useRuleForm(branches);

  function showSuccess(msg: string) {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(null), 4000);
  }

  const handleAdd = form.handleSubmit((values) => {
    setError(null);
    const formData = ruleDraftToFormData(toRuleDraft(values));
    formData.set("doctorId", doctorId);
    startTransition(async () => {
      const res = await createRuleAction(formData, clinicId);
      if (res?.error) {
        setError(res.error);
        return;
      }
      setAddOpen(false);
      showSuccess("تم إنشاء القاعدة وتوليد المواعيد");
      form.reset(ruleFormDefaults(branches[0]?.id));
      router.refresh();
    });
  });

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
      const res = await deleteRuleAction(ruleId, doctorId);
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
      const res = await toggleRuleActiveAction(rule.id, !rule.isActive, doctorId);
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
    const res = await generateSlotsAction(ruleId, doctorId);
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
        <Button onClick={() => setAddOpen(true)} disabled={branches.length === 0}>
          <Plus />
          إضافة قاعدة
        </Button>
      </div>

      {branches.length === 0 && (
        <Alert variant="warning" className="mb-4">
          هذا الطبيب غير معيّن لأي فرع. عيّن فرعاً له من زر «تعديل» أعلى الصفحة قبل إضافة قواعد
          التوفر.
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
                <Hint label={rule.isActive ? "تعطيل" : "تفعيل"}>
                  <Switch
                    checked={rule.isActive}
                    onCheckedChange={() => handleToggleActive(rule)}
                    disabled={isPending}
                    aria-label={rule.isActive ? "تعطيل القاعدة" : "تفعيل القاعدة"}
                    className="data-[state=checked]:bg-emerald-500"
                  />
                </Hint>

                {/* Queue (order-based) rules need no slot generation — the day
                    is implicitly available and order numbers are handed out on
                    booking, so the generate button is slot-based only. */}
                {!isQueueMode(rule.mode) && (
                  <Hint label="توليد مواعيد للـ 30 يوم القادمة">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleGenerate(rule.id)}
                      disabled={generatingId === rule.id}
                      className="text-muted-foreground hover:border-primary/50 hover:bg-transparent hover:text-primary [&_svg]:size-3.5"
                    >
                      <Zap />
                      {generatingId === rule.id ? "جارٍ التوليد..." : "توليد مواعيد"}
                    </Button>
                  </Hint>
                )}

                <Hint label="حذف القاعدة">
                  <Button
                    variant="ghost-destructive"
                    size="icon"
                    onClick={() => handleDelete(rule.id)}
                    disabled={isPending}
                    aria-label="حذف القاعدة"
                  >
                    <Trash2 />
                  </Button>
                </Hint>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal open={addOpen} onClose={() => setAddOpen(false)} title="إضافة قاعدة توفر">
        <form onSubmit={handleAdd} noValidate className="space-y-4">
          <RuleFields control={form.control} branches={branches} />

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
