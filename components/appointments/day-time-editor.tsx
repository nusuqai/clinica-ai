"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Clock } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  dayOnlyDatesAction,
  moveDayOnlyAppointmentAction,
  setAppointmentTimeAction,
} from "@/server/actions/admin";
import { setAppointmentTimeAsDoctorAction } from "@/server/actions/doctor";
import { DAY_ONLY_PENDING_TIME_AR } from "@/lib/availability/modes";
import { formatSlotDate } from "@/lib/slot-time";

interface DayOption {
  date: string;
  branchId: string;
  branchName: string;
  startTime: string;
  endTime: string;
}

/**
 * Day-only booking (حجز يوم فقط): the team sets the exact time they agreed with
 * the patient on the phone — and staff (ADMIN role: admin / staff with the
 * appointments permission) may also move the visit to another of the doctor's
 * day-only days. Any time is accepted (overlaps are the clinic's
 * responsibility); a time outside the day's hours, or a day past its cap, is
 * saved with a warning. The patient is not messaged automatically.
 */
export default function DayTimeEditor({
  appointmentId,
  initialTime,
  initialDate,
  initialBranchId,
  role,
  editable,
}: {
  appointmentId: string;
  initialTime: string | null;
  /** "YYYY-MM-DD" — the current booking day. */
  initialDate: string | null;
  initialBranchId?: string | null;
  role: "ADMIN" | "DOCTOR";
  /** False = read-only (patient view, finished visit, or no permission). */
  editable: boolean;
}) {
  const router = useRouter();
  const canMove = role === "ADMIN";
  const [time, setTime] = useState(initialTime ?? "");
  const [saved, setSaved] = useState(initialTime);
  const [savedDate, setSavedDate] = useState(initialDate);
  const [dayKey, setDayKey] = useState(
    initialDate ? `${initialDate}|${initialBranchId ?? ""}` : ""
  );
  const [days, setDays] = useState<DayOption[] | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [pending, start] = useTransition();

  useEffect(() => {
    if (!editable || !canMove) return;
    dayOnlyDatesAction(appointmentId).then((r) => setDays(r.dates));
  }, [appointmentId, editable, canMove]);

  if (!editable) {
    return saved ? (
      <span dir="ltr">{saved}</span>
    ) : (
      <span className="text-amber-700">{DAY_ONLY_PENDING_TIME_AR}</span>
    );
  }

  const [pickedDate, pickedBranch] = dayKey.split("|");
  const dateChanged = canMove && !!pickedDate && pickedDate !== savedDate;
  const dirty = dateChanged || (time || null) !== saved;
  // Keep the current day selectable even if it's no longer a listed day.
  const options: DayOption[] = days
    ? days.some((d) => `${d.date}|${d.branchId}` === dayKey) || !savedDate
      ? days
      : [
          {
            date: savedDate,
            branchId: initialBranchId ?? "",
            branchName: "",
            startTime: "",
            endTime: "",
          },
          ...days,
        ]
    : [];
  const multiBranch = new Set(options.map((o) => o.branchId)).size > 1;

  const save = (clearTime = false) =>
    start(async () => {
      const value = clearTime ? null : time || null;
      if (dateChanged) {
        const res = await moveDayOnlyAppointmentAction(
          appointmentId,
          pickedDate,
          value,
          pickedBranch || null
        );
        if ("error" in res && res.error) return void toast.error(res.error);
        if (!("success" in res)) return;
        setSaved(res.scheduledTime);
        setTime(res.scheduledTime ?? "");
        setSavedDate(res.bookingDate);
        setWarnings(res.warnings);
        toast.success("تم نقل الموعد إلى اليوم الجديد");
      } else {
        const res =
          role === "ADMIN"
            ? await setAppointmentTimeAction(appointmentId, value)
            : await setAppointmentTimeAsDoctorAction(appointmentId, value);
        if ("error" in res && res.error) return void toast.error(res.error);
        if (!("success" in res)) return;
        setSaved(res.scheduledTime);
        setTime(res.scheduledTime ?? "");
        setWarnings(res.warning ? [res.warning] : []);
        toast.success(res.scheduledTime ? "تم حفظ وقت الموعد" : "تم مسح وقت الموعد");
      }
      router.refresh();
    });

  return (
    <div className="space-y-2">
      {!saved && (
        <p className="font-sans text-xs text-amber-700">
          {DAY_ONLY_PENDING_TIME_AR} — تواصل مع المريض لتحديد الوقت المناسب ثم سجّله هنا.
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        {canMove && (
          <select
            value={dayKey}
            onChange={(e) => setDayKey(e.target.value)}
            disabled={days == null}
            aria-label="يوم الموعد"
            className="h-9 rounded-md border border-input bg-background px-2 font-sans text-sm"
          >
            {days == null && <option value={dayKey}>جارٍ تحميل الأيام...</option>}
            {options.map((d) => (
              <option key={`${d.date}|${d.branchId}`} value={`${d.date}|${d.branchId}`}>
                {formatSlotDate(d.date, { weekday: "long", day: "numeric", month: "short" })}
                {multiBranch && d.branchName ? ` — ${d.branchName}` : ""}
                {d.startTime ? ` (${d.startTime}–${d.endTime})` : ""}
              </option>
            ))}
          </select>
        )}
        <div className="relative">
          <Clock className="pointer-events-none absolute start-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="time"
            dir="ltr"
            value={time}
            onChange={(e) => setTime(e.target.value)}
            className="h-9 w-36 ps-8"
            aria-label="وقت الموعد"
          />
        </div>
        <Button size="sm" onClick={() => save()} disabled={pending || !dirty}>
          {dateChanged ? "نقل الموعد" : saved ? "تحديث الوقت" : "حفظ الوقت"}
        </Button>
        {saved && !dateChanged && (
          <Button size="sm" variant="ghost" onClick={() => save(true)} disabled={pending}>
            مسح الوقت
          </Button>
        )}
      </div>
      {warnings.map((w) => (
        <p
          key={w}
          className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 font-sans text-xs text-amber-800"
        >
          {w}
        </p>
      ))}
      <p className="font-sans text-xs text-muted-foreground">
        {canMove ? "يمكن النقل لأيام «حجز اليوم» الخاصة بالطبيب فقط. " : ""}
        لا يتم التحقق من تداخل المواعيد — المسؤولية على العيادة. لا تُرسل رسالة تلقائية للمريض.
      </p>
    </div>
  );
}
