"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CalendarClock, Pencil, Send, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import type { OperationStatus } from "@prisma/client";
import Modal from "@/components/admin/modal";
import { moneyInputHint } from "@/lib/currency";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { OPERATION_TRANSITIONS, isSchedulable, transitionLabel } from "@/lib/operations";
import {
  previewOperationMessageAction,
  previewScheduleConflictsAction,
  scheduleOperationAction,
  sendOperationMessageAction,
  setOperationStatusAction,
  updateOperationAction,
} from "@/server/actions/operations";
import type {
  OperationDetail,
  OperationFormOptions,
  OperationMessageKind,
} from "@/server/services/operations";

function showConflicts(conflicts: string[] | undefined) {
  if (conflicts?.length)
    toast.warning(`تنبيه — تعارض مع جدول الجرّاح:\n${conflicts.join("\n")}`, { duration: 10000 });
}

/** Status buttons + schedule + send-to-patient, for the case header. */
export function OperationHeaderActions({ op }: { op: OperationDetail }) {
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [sendOpen, setSendOpen] = useState(false);
  const [statusTarget, setStatusTarget] = useState<OperationStatus | null>(null);

  const targets = OPERATION_TRANSITIONS[op.status];
  return (
    <div className="flex flex-wrap items-center gap-2">
      {isSchedulable(op.status) && (
        <Button size="sm" onClick={() => setScheduleOpen(true)}>
          <CalendarClock />
          {op.scheduledDate ? "تغيير الموعد" : "تحديد الموعد"}
        </Button>
      )}
      <Button size="sm" variant="outline" onClick={() => setSendOpen(true)}>
        <Send />
        إرسال للمريض
      </Button>
      {targets.map((t) => (
        <Button
          key={t}
          size="sm"
          variant={t === "CANCELLED" ? "ghost-destructive" : t === "DONE" ? "success" : "outline"}
          onClick={() => setStatusTarget(t)}
        >
          {transitionLabel(op.status, t)}
        </Button>
      ))}

      <ScheduleModal op={op} open={scheduleOpen} onClose={() => setScheduleOpen(false)} />
      <SendMessageModal op={op} open={sendOpen} onClose={() => setSendOpen(false)} />
      <StatusModal op={op} target={statusTarget} onClose={() => setStatusTarget(null)} />
    </div>
  );
}

function StatusModal({
  op,
  target,
  onClose,
}: {
  op: OperationDetail;
  target: OperationStatus | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  useEffect(() => {
    setReason("");
    setError(null);
  }, [target]);
  if (!target) return null;
  const askReason = target === "CANCELLED" || (target === "PREPARING" && op.status === "SCHEDULED");

  function confirm() {
    if (!target) return;
    startTransition(async () => {
      const res = await setOperationStatusAction(op.id, target, reason || null);
      if (!res.ok) return setError(res.error);
      toast.success("تم تحديث الحالة");
      onClose();
      router.refresh();
    });
  }

  return (
    <Modal open onClose={onClose} title={transitionLabel(op.status, target)}>
      <div className="space-y-4">
        {error && <Alert variant="destructive">{error}</Alert>}
        <p className="font-sans text-sm text-muted-foreground">
          {target === "DONE" &&
            "سيتم تعليم العملية «تمت» وتبدأ مرحلة المتابعة (ويُرسل الاطمئنان الآلي إن كان مفعّلاً)."}
          {target === "CANCELLED" && "سيتم إلغاء العملية وتحرير جدول الجرّاح إن كانت محددة."}
          {target === "PREPARING" &&
            op.status === "SCHEDULED" &&
            "سيُلغى الموعد المحدد ويتحرر جدول الجرّاح، وتعود الحالة «قيد التجهيز» لتحديد موعد جديد."}
          {target === "PREPARING" &&
            op.status === "REQUESTED" &&
            "تم التواصل مع المريض وبدأ تجهيز العملية."}
          {target === "PREPARING" && op.status === "CANCELLED" && "ستُعاد فتح الحالة للتجهيز."}
          {target === "CLOSED" && "انتهت متابعة ما بعد العملية وتُغلق الحالة."}
          {target === "DONE" && op.status === "CLOSED" && " (إعادة فتح المتابعة)"}
        </p>
        {askReason && (
          <FormField
            type="textarea"
            rows={2}
            label="السبب (اختياري)"
            value={reason}
            onValueChange={setReason}
          />
        )}
        <div className="flex gap-3">
          <Button
            onClick={confirm}
            loading={isPending}
            variant={target === "CANCELLED" ? "destructive" : "default"}
            className="flex-1"
          >
            تأكيد
          </Button>
          <Button variant="outline" onClick={onClose}>
            رجوع
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function ScheduleModal({
  op,
  open,
  onClose,
}: {
  op: OperationDetail;
  open: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const [date, setDate] = useState(op.scheduledDate ?? "");
  const [time, setTime] = useState(op.startTime ?? "");
  const [duration, setDuration] = useState(op.durationMin ? String(op.durationMin) : "");
  const [conflicts, setConflicts] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (!open) return;
    setDate(op.scheduledDate ?? "");
    setTime(op.startTime ?? "");
    setDuration(op.durationMin ? String(op.durationMin) : "");
    setError(null);
    setConflicts([]);
  }, [open, op.scheduledDate, op.startTime, op.durationMin]);

  const durationNum = duration.trim() === "" ? null : Number(duration);

  // Live conflict check as the date / time change.
  useEffect(() => {
    if (!open || !date || !/^\d{1,2}:\d{2}$/.test(time)) {
      setConflicts([]);
      return;
    }
    let cancelled = false;
    const t = setTimeout(() => {
      previewScheduleConflictsAction(op.id, {
        date,
        startTime: time,
        durationMin: durationNum,
      }).then((res) => !cancelled && setConflicts(res.ok ? res.conflicts : []));
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [open, date, time, durationNum, op.id]);

  function save() {
    setError(null);
    startTransition(async () => {
      const res = await scheduleOperationAction(op.id, {
        date,
        startTime: time,
        durationMin: durationNum,
      });
      if (!res.ok) return setError(res.error);
      toast.success("تم تحديد موعد العملية");
      showConflicts(res.conflicts);
      onClose();
      router.refresh();
    });
  }

  const today = new Date().toISOString().slice(0, 10);
  return (
    <Modal open={open} onClose={onClose} title="موعد العملية">
      <div className="space-y-4">
        {error && <Alert variant="destructive">{error}</Alert>}
        {!op.doctor && (
          <Alert variant="destructive">
            حدّد الجرّاح أولاً من «تعديل البيانات» قبل تحديد الموعد.
          </Alert>
        )}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <FormField type="date" label="التاريخ" value={date} onValueChange={setDate} min={today} />
          <FormField type="time" label="الوقت" value={time} onValueChange={setTime} />
          <FormField
            type="number"
            min={5}
            label="المدة (دقيقة)"
            value={duration}
            onValueChange={setDuration}
            placeholder="120"
          />
        </div>
        {op.doctor && (
          <p className="font-sans text-xs text-muted-foreground">
            {op.blockSchedule
              ? `سيُحجز جدول ${op.doctor.fullName} في هذا الوقت فلا يُحجز عليه مواعيد.`
              : `لن يُحجز جدول ${op.doctor.fullName} (الخيار مُعطّل في بيانات العملية).`}
          </p>
        )}
        {conflicts.length > 0 && (
          <Alert>
            <div className="flex gap-2">
              <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
              <div>
                <p className="font-medium">يوجد في جدول الجرّاح في هذا الوقت:</p>
                <ul className="mt-1 list-disc ps-4 text-xs">
                  {conflicts.map((c) => (
                    <li key={c}>{c}</li>
                  ))}
                </ul>
                <p className="mt-1 text-xs">
                  هذه المواعيد لن تُلغى تلقائياً — تواصل مع أصحابها لنقلها إن لزم.
                </p>
              </div>
            </div>
          </Alert>
        )}
        <div className="flex gap-3">
          <Button
            onClick={save}
            loading={isPending}
            disabled={!op.doctor || !date || !time}
            className="flex-1"
          >
            حفظ الموعد
          </Button>
          <Button variant="outline" onClick={onClose}>
            إلغاء
          </Button>
        </div>
      </div>
    </Modal>
  );
}

const MESSAGE_OPTIONS: { value: OperationMessageKind; label: string }[] = [
  { value: "details", label: "تفاصيل العملية (الموعد والمكان والتعليمات)" },
  { value: "preop", label: "تعليمات ما قبل العملية والتجهيزات" },
  { value: "postop", label: "تعليمات ما بعد العملية" },
  { value: "custom", label: "رسالة مخصّصة" },
];

function SendMessageModal({
  op,
  open,
  onClose,
}: {
  op: OperationDetail;
  open: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const defaultKind: OperationMessageKind =
    op.status === "DONE" || op.status === "CLOSED"
      ? "postop"
      : op.status === "SCHEDULED"
        ? "details"
        : "preop";
  const [kind, setKind] = useState<OperationMessageKind>(defaultKind);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (open) setKind(defaultKind);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // The composed text is editable: picking a kind fills it, then it's "custom".
  useEffect(() => {
    if (!open) return;
    setError(null);
    if (kind === "custom") return;
    let cancelled = false;
    setLoading(true);
    previewOperationMessageAction(op.id, kind).then((res) => {
      if (cancelled) return;
      setLoading(false);
      if (res.ok) setText(res.text);
      else {
        setText("");
        setError(res.error);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [open, kind, op.id]);

  function send() {
    setError(null);
    startTransition(async () => {
      // Whatever is in the box is what goes out.
      const res = await sendOperationMessageAction(op.id, "custom", text);
      if (!res.ok) return setError(res.error);
      toast.success("تم إرسال الرسالة للمريض على واتساب");
      onClose();
      router.refresh();
    });
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`رسالة واتساب إلى ${op.patient.fullName}`}
      width="max-w-xl"
    >
      <div className="space-y-4">
        {error && <Alert variant="destructive">{error}</Alert>}
        <FormField
          type="select"
          label="المحتوى"
          options={MESSAGE_OPTIONS}
          value={kind}
          onValueChange={(v) => setKind(v as OperationMessageKind)}
        />
        <FormField
          type="textarea"
          rows={10}
          label="نص الرسالة"
          value={text}
          onValueChange={setText}
          disabled={loading}
          hint="يمكنك تعديل النص قبل الإرسال. تظهر الرسالة في محادثة المريض في صندوق الرسائل."
        />
        <div className="flex gap-3">
          <Button
            onClick={send}
            loading={isPending}
            disabled={!text.trim() || loading}
            className="flex-1"
          >
            <Send />
            إرسال
          </Button>
          <Button variant="outline" onClick={onClose}>
            إلغاء
          </Button>
        </div>
      </div>
    </Modal>
  );
}

/** Edit the case details (surgeon, place, money, anesthesia, coordinator…). */
export function EditOperationButton({
  op,
  options,
}: {
  op: OperationDetail;
  options: OperationFormOptions;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const HOSPITAL = "__hospital__";
  const initial = () => ({
    name: op.name,
    serviceId: op.serviceId ?? "",
    doctorId: op.doctor?.id ?? "",
    place: op.branchId ?? (op.hospitalName ? HOSPITAL : ""),
    hospital: op.hospitalName ?? "",
    duration: op.durationMin ? String(op.durationMin) : "",
    anesthesia: op.anesthesia ?? "",
    price: op.price != null ? String(op.price) : "",
    coordinatorId: op.coordinator?.id ?? "",
    consentSigned: op.consentSigned,
    blockSchedule: op.blockSchedule,
    notes: op.notes ?? "",
  });
  const [v, setV] = useState(initial);
  const set = <K extends keyof ReturnType<typeof initial>>(
    k: K,
    val: ReturnType<typeof initial>[K]
  ) => setV((s) => ({ ...s, [k]: val }));

  function save() {
    setError(null);
    const price = v.price.trim() === "" ? null : Number(v.price);
    const duration = v.duration.trim() === "" ? null : Number(v.duration);
    if (price != null && (!Number.isFinite(price) || price < 0))
      return setError("التكلفة غير صالحة");
    if (duration != null && (!Number.isInteger(duration) || duration < 5))
      return setError("المدة غير صالحة");
    if (v.place === HOSPITAL && !v.hospital.trim()) return setError("اكتب اسم المستشفى");
    startTransition(async () => {
      const res = await updateOperationAction(op.id, {
        name: v.name,
        serviceId: v.serviceId || null,
        doctorId: v.doctorId || null,
        branchId: v.place && v.place !== HOSPITAL ? v.place : null,
        hospitalName: v.place === HOSPITAL ? v.hospital : null,
        durationMin: duration,
        anesthesia: v.anesthesia,
        price,
        coordinatorId: v.coordinatorId || null,
        consentSigned: v.consentSigned,
        blockSchedule: v.blockSchedule,
        notes: v.notes,
      });
      if (!res.ok) return setError(res.error);
      toast.success("تم حفظ التعديلات");
      showConflicts(res.conflicts);
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <>
      <Button
        size="sm"
        variant="outline"
        onClick={() => {
          setV(initial());
          setError(null);
          setOpen(true);
        }}
      >
        <Pencil />
        تعديل البيانات
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} title="بيانات العملية" width="max-w-2xl">
        <div className="space-y-4">
          {error && <Alert variant="destructive">{error}</Alert>}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FormField label="اسم العملية" value={v.name} onValueChange={(x) => set("name", x)} />
            <FormField
              type="select"
              label="نوع العملية (الكتالوج)"
              options={[
                { value: "", label: "بدون" },
                ...options.services.map((s) => ({ value: s.id, label: s.name })),
              ]}
              value={v.serviceId}
              onValueChange={(x) => set("serviceId", x)}
            />
            <FormField
              type="select"
              label="الجرّاح"
              options={[
                { value: "", label: "لم يُحدَّد" },
                ...options.doctors.map((d) => ({ value: d.id, label: d.name })),
              ]}
              value={v.doctorId}
              onValueChange={(x) => set("doctorId", x)}
            />
            <FormField
              type="select"
              label="المكان"
              options={[
                { value: "", label: "لم يُحدَّد" },
                ...options.branches.map((b) => ({ value: b.id, label: `فرع ${b.name}` })),
                { value: HOSPITAL, label: "مستشفى خارجي" },
              ]}
              value={v.place}
              onValueChange={(x) => set("place", x)}
            />
            {v.place === HOSPITAL && (
              <FormField
                label="اسم المستشفى"
                value={v.hospital}
                onValueChange={(x) => set("hospital", x)}
                className="sm:col-span-2"
              />
            )}
            <FormField
              type="number"
              min={5}
              label="المدة المتوقعة (دقيقة)"
              value={v.duration}
              onValueChange={(x) => set("duration", x)}
              placeholder="120"
            />
            <FormField
              label="نوع التخدير"
              value={v.anesthesia}
              onValueChange={(x) => set("anesthesia", x)}
              placeholder="كلي / نصفي / موضعي"
            />
            <FormField
              type="number"
              min={0}
              step="0.01"
              label="التكلفة المتفق عليها"
              value={v.price}
              onValueChange={(x) => set("price", x)}
              hint={moneyInputHint(v.price)}
            />
            <FormField
              type="select"
              label="المسؤول عن الحالة"
              options={[
                { value: "", label: "بدون" },
                ...options.team.map((t) => ({ value: t.id, label: t.name })),
              ]}
              value={v.coordinatorId}
              onValueChange={(x) => set("coordinatorId", x)}
            />
          </div>
          <FormField
            type="switch"
            label="تم توقيع إقرار الموافقة على العملية"
            checked={v.consentSigned}
            onCheckedChange={(x) => set("consentSigned", x)}
          />
          <FormField
            type="switch"
            label="حجز جدول الجرّاح وقت العملية"
            hint="يمنع حجز مواعيد مع الجرّاح أثناء العملية. أوقفه إن كانت العملية خارج أوقات عمله في العيادة."
            checked={v.blockSchedule}
            onCheckedChange={(x) => set("blockSchedule", x)}
          />
          <FormField
            type="textarea"
            rows={3}
            label="ملاحظات داخلية"
            hint="للفريق فقط — لا تُرسل للمريض."
            value={v.notes}
            onValueChange={(x) => set("notes", x)}
          />
          <div className="flex gap-3">
            <Button onClick={save} loading={isPending} className="flex-1">
              حفظ
            </Button>
            <Button variant="outline" onClick={() => setOpen(false)}>
              إلغاء
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
