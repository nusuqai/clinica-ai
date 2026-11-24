"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { CalendarClock, Save, TriangleAlert } from "lucide-react";
import type { DataReportCoverage } from "@prisma/client";
import { saveReportScheduleAction } from "@/server/actions/exports";
import type { ReportScheduleView } from "@/server/services/exports/settings";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const COVERAGE_LABEL: Record<DataReportCoverage, string> = {
  TODAY: "اليوم نفسه حتى وقت الإرسال (مثلاً آخر اليوم)",
  YESTERDAY: "اليوم السابق كاملاً (مثلاً صباح اليوم التالي)",
};

export default function ReportSchedule({ view }: { view: ReportScheduleView }) {
  const [pending, startTransition] = useTransition();
  const [enabled, setEnabled] = useState(view.enabled);
  const [sendTime, setSendTime] = useState(view.sendTime);
  const [coverage, setCoverage] = useState<DataReportCoverage>(view.coverage);
  const [recipients, setRecipients] = useState<string[]>(view.recipients);

  function toggle(memberId: string, on: boolean) {
    setRecipients((r) => (on ? [...new Set([...r, memberId])] : r.filter((id) => id !== memberId)));
  }

  function save() {
    startTransition(async () => {
      const res = await saveReportScheduleAction({ enabled, sendTime, coverage, recipients });
      if (res.ok) toast.success("تم حفظ إعدادات التقرير اليومي");
      else toast.error(res.error);
    });
  }

  const chosenUnlinked = view.members.filter((m) => recipients.includes(m.memberId) && !m.whatsapp);

  return (
    <Card className="p-5">
      <div className="mb-4">
        <div className="flex items-center gap-2">
          <CalendarClock className="h-5 w-5 text-primary" />
          <h2 className="font-heading text-base font-semibold">التقرير اليومي على واتساب</h2>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          يصل ملف Excel نفسه تلقائياً كل يوم في الوقت الذي تحدده لمن تختارهم من الفريق على واتساب.
          كل عضو يصله ما تسمح به صلاحياته: فروعه فقط، والبيانات الطبية لمن لديه صلاحية السجلات
          الطبية. الوقت حسب توقيت العيادة ({view.timeZone}).
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-6">
        <label className="flex items-center gap-3">
          <Switch checked={enabled} onCheckedChange={setEnabled} />
          <span className="text-sm">{enabled ? "التقرير مفعّل" : "التقرير متوقف"}</span>
        </label>
        <div className="space-y-1">
          <Label htmlFor="send-time">وقت الإرسال</Label>
          <Input
            id="send-time"
            type="time"
            value={sendTime}
            onChange={(e) => setSendTime(e.target.value)}
            className="w-32"
          />
        </div>
        <div className="min-w-64 space-y-1">
          <Label>يغطي</Label>
          <Select value={coverage} onValueChange={(v) => setCoverage(v as DataReportCoverage)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(COVERAGE_LABEL) as DataReportCoverage[]).map((c) => (
                <SelectItem key={c} value={c}>
                  {COVERAGE_LABEL[c]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="mt-5 rounded-lg border border-border p-4">
        <p className="mb-3 text-sm font-semibold">من يصله التقرير</p>
        <div className="flex flex-col gap-2.5">
          {view.members.map((m) => (
            <label
              key={m.memberId}
              className={`flex flex-wrap items-center gap-2 text-sm ${m.canReceive ? "" : "opacity-50"}`}
            >
              <Checkbox
                checked={recipients.includes(m.memberId)}
                disabled={!m.canReceive}
                onCheckedChange={(v) => toggle(m.memberId, v === true)}
              />
              <span>{m.name}</span>
              <span className="text-xs text-muted-foreground">{m.roleLabel}</span>
              {!m.canReceive && <Badge variant="muted">بدون صلاحية التقارير</Badge>}
              {m.canReceive && !m.whatsapp && <Badge variant="muted">واتساب غير مربوط</Badge>}
              {m.canReceive && m.branchLimited && <Badge variant="muted">فروعه فقط</Badge>}
              {m.canReceive && !m.medical && <Badge variant="muted">بدون بيانات طبية</Badge>}
            </label>
          ))}
        </div>
      </div>

      {chosenUnlinked.length > 0 && (
        <p className="mt-3 flex items-start gap-1.5 text-xs text-amber-600">
          <TriangleAlert className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
          {chosenUnlinked.map((m) => m.name).join("، ")}: لن يصلهم التقرير حتى يربطوا رقمهم من صفحة
          «واتساب الخاص بي».
        </p>
      )}
      {view.hasOfficialNumber && !view.alertTemplateBound && (
        <p className="mt-3 flex items-start gap-1.5 text-xs text-amber-600">
          <TriangleAlert className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
          الرقم الرسمي لا يرسل ملفاً لمن لم يراسل العيادة خلال 24 ساعة. اربط «قالب التنبيهات» من
          صفحة مساعد الفريق ليصلهم إشعار بأن التقرير جاهز، أو سيصلهم الملف عند أول رسالة يرسلونها.
        </p>
      )}

      <div className="mt-5">
        <Button onClick={save} disabled={pending}>
          <Save className="h-4 w-4" /> حفظ
        </Button>
      </div>
    </Card>
  );
}
