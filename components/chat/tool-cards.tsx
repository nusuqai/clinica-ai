"use client";

import {
  Stethoscope,
  CalendarClock,
  CheckCircle2,
  XCircle,
  CalendarCheck,
  ListChecks,
  BarChart3,
  Wrench,
} from "lucide-react";
import type { ClientToolCall } from "./types";

// ── shared layout ────────────────────────────────────────────────────────────

function CardShell({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mt-1.5 rounded-xl border border-border bg-card overflow-hidden text-start">
      <div className="flex items-center gap-2 px-3 py-2 bg-muted/50 border-b border-border">
        <span className="text-accent">{icon}</span>
        <span className="text-xs font-heading font-semibold text-foreground">
          {title}
        </span>
      </div>
      <div className="p-3 space-y-2">{children}</div>
    </div>
  );
}

function ErrorCard({ message }: { message: string }) {
  return (
    <div className="mt-1.5 flex items-center gap-2 rounded-xl bg-red-50 text-red-600 px-3 py-2 text-xs font-sans">
      <XCircle className="w-4 h-4 flex-shrink-0" />
      <span>{message}</span>
    </div>
  );
}

const STATUS_AR: Record<string, string> = {
  PENDING: "قيد الانتظار",
  CONFIRMED: "مؤكد",
  CANCELLED: "ملغى",
  COMPLETED: "مكتمل",
  NO_SHOW: "لم يحضر",
};

function StatusPill({ status }: { status: string }) {
  const color =
    status === "CONFIRMED" || status === "COMPLETED"
      ? "bg-green-100 text-green-700"
      : status === "CANCELLED" || status === "NO_SHOW"
        ? "bg-red-100 text-red-600"
        : "bg-amber-100 text-amber-700";
  return (
    <span
      className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium ${color}`}
    >
      {STATUS_AR[status] ?? status}
    </span>
  );
}

// ── individual cards ─────────────────────────────────────────────────────────

type R = Record<string, unknown>;

function DoctorListCard({ result }: { result: R }) {
  const doctors = (result.doctors as R[]) ?? [];
  return (
    <CardShell icon={<Stethoscope className="w-4 h-4" />} title="الأطباء">
      {doctors.length === 0 && (
        <p className="text-xs text-muted-foreground">لا يوجد أطباء مطابقون.</p>
      )}
      {doctors.map((d, i) => (
        <div key={i} className="flex items-center justify-between gap-2">
          <div>
            <p className="text-xs font-medium text-foreground">
              {String(d.name)}
            </p>
            <p className="text-[11px] text-muted-foreground">
              {String(d.specialty)}
            </p>
          </div>
          {d.fee != null && (
            <span className="text-[11px] text-accent font-medium">
              {String(d.fee)} ج.م
            </span>
          )}
        </div>
      ))}
    </CardShell>
  );
}

function SlotsCard({ result }: { result: R }) {
  const slots = (result.slots as R[]) ?? [];
  return (
    <CardShell
      icon={<CalendarClock className="w-4 h-4" />}
      title={`المواعيد المتاحة${result.date ? ` — ${result.date}` : ""}`}
    >
      {!!result.doctorName && (
        <p className="text-[11px] text-muted-foreground">
          {String(result.doctorName)}
        </p>
      )}
      {slots.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          لا توجد مواعيد متاحة في هذا اليوم.
        </p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {slots.map((s, i) => (
            <span
              key={i}
              className="rounded-lg border border-border bg-background px-2 py-1 text-[11px] text-foreground"
              dir="ltr"
            >
              {String(s.label ?? s.time)}
            </span>
          ))}
        </div>
      )}
    </CardShell>
  );
}

function AppointmentCard({ result }: { result: R }) {
  return (
    <CardShell
      icon={<CalendarCheck className="w-4 h-4" />}
      title="تفاصيل الموعد"
    >
      <div className="space-y-1 text-xs text-foreground">
        {!!result.doctorName && (
          <p>
            الطبيب:{" "}
            <span className="font-medium">{String(result.doctorName)}</span>
          </p>
        )}
        {!!result.date && (
          <p dir="ltr" className="text-start">
            {String(result.date)} — {String(result.time ?? "")}
          </p>
        )}
        {!!result.status && (
          <div className="flex items-center gap-1.5">
            <span className="text-muted-foreground text-[11px]">الحالة:</span>
            <StatusPill status={String(result.status)} />
          </div>
        )}
      </div>
    </CardShell>
  );
}

function AppointmentListCard({ result }: { result: R }) {
  const appts = (result.appointments as R[]) ?? [];
  return (
    <CardShell icon={<ListChecks className="w-4 h-4" />} title="المواعيد">
      {appts.length === 0 && (
        <p className="text-xs text-muted-foreground">لا توجد مواعيد.</p>
      )}
      {appts.map((a, i) => (
        <div
          key={i}
          className="flex items-center justify-between gap-2 border-b border-border/50 pb-1.5 last:border-0 last:pb-0"
        >
          <div>
            <p className="text-xs font-medium text-foreground">
              {String(a.doctorName ?? a.patientName ?? "")}
            </p>
            <p className="text-[11px] text-muted-foreground" dir="ltr">
              {String(a.date)} — {String(a.time)}
            </p>
          </div>
          <StatusPill status={String(a.status)} />
        </div>
      ))}
    </CardShell>
  );
}

function StatsCard({ result }: { result: R }) {
  const entries = Object.entries(result).filter(
    ([, v]) => typeof v === "number",
  );
  const LABELS: Record<string, string> = {
    total: "الإجمالي",
    upcoming: "قادمة",
    completed: "مكتملة",
    cancelled: "ملغاة",
    todayCount: "اليوم",
    pendingCount: "معلّقة",
    completedCount: "مكتملة",
    totalCount: "الإجمالي",
    uniquePatientsCount: "المرضى",
    totalUsers: "المستخدمون",
    totalDoctors: "الأطباء",
    totalPatients: "المرضى",
    totalAppointments: "المواعيد",
    pendingAppointments: "معلّقة",
    confirmedAppointments: "مؤكدة",
    cancelledAppointments: "ملغاة",
    completedAppointments: "مكتملة",
    totalConversations: "المحادثات",
  };
  return (
    <CardShell icon={<BarChart3 className="w-4 h-4" />} title="الإحصائيات">
      <div className="grid grid-cols-2 gap-2">
        {entries.map(([k, v]) => (
          <div key={k} className="rounded-lg bg-muted/50 px-2 py-1.5">
            <p className="text-sm font-heading font-bold text-foreground">
              {String(v)}
            </p>
            <p className="text-[10px] text-muted-foreground">
              {LABELS[k] ?? k}
            </p>
          </div>
        ))}
      </div>
    </CardShell>
  );
}

// Friendly Arabic labels for tools that don't have a dedicated card.
const TOOL_LABELS: Record<string, string> = {
  get_current_datetime: "التحقق من التاريخ والوقت",
  add_doctor_notes: "إضافة ملاحظات الطبيب",
  list_my_patients: "عرض قائمة المرضى",
  get_my_schedule: "عرض الجدول الزمني",
  block_slot: "حجب الموعد",
  unblock_slot: "إلغاء حجب الموعد",
  create_availability_rule: "إنشاء قاعدة توفر",
  generate_slots: "إنشاء المواعيد المتاحة",
  escalate_to_human: "تحويل المحادثة إلى موظف",
  create_doctor_account: "إنشاء حساب طبيب",
  update_doctor: "تحديث بيانات الطبيب",
  set_doctor_active: "تحديث حالة تفعيل الطبيب",
  list_users: "عرض قائمة المستخدمين",
  update_user_role: "تحديث صلاحية المستخدم",
  list_doctor_rules: "عرض قواعد توفر الطبيب",
  delete_availability_rule: "حذف قاعدة التوفر",
  toggle_rule_active: "تفعيل/تعطيل قاعدة التوفر",
  list_doctor_slots: "عرض مواعيد الطبيب",
  toggle_slot_blocked: "تفعيل/تعطيل حجب الموعد",
  send_message_to_conversation: "إرسال رسالة للمحادثة",
  cancel_appointment: "إلغاء الموعد",
  update_my_profile: "تحديث الملف الشخصي",
};

function GenericToolCard({ name, result }: { name: string; result: R }) {
  if (result.escalated) {
    return (
      <div className="mt-1.5 flex items-center gap-2 rounded-xl bg-accent/10 text-accent px-3 py-2 text-xs font-sans">
        <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
        <span>تم تحويل المحادثة إلى موظف بشري، سيتم التواصل معك قريباً.</span>
      </div>
    );
  }
  return (
    <CardShell icon={<Wrench className="w-4 h-4" />} title="تم التنفيذ">
      <div className="flex items-center gap-2 text-xs text-foreground">
        <CheckCircle2 className="w-4 h-4 text-green-600 flex-shrink-0" />
        <span className="text-muted-foreground">
          {TOOL_LABELS[name] ?? name}
        </span>
      </div>
    </CardShell>
  );
}

// ── registry ─────────────────────────────────────────────────────────────────

const REGISTRY: Record<string, (r: R) => React.ReactNode> = {
  list_doctors: (r) => <DoctorListCard result={r} />,
  search_doctors_by_specialty: (r) => <DoctorListCard result={r} />,
  list_all_doctors: (r) => <DoctorListCard result={r} />,
  get_doctor_availability: (r) => <SlotsCard result={r} />,
  book_appointment: (r) => <AppointmentCard result={r} />,
  reschedule_appointment: (r) => <AppointmentCard result={r} />,
  list_my_appointments: (r) => <AppointmentListCard result={r} />,
  list_all_appointments: (r) => <AppointmentListCard result={r} />,
  get_my_stats: (r) => <StatsCard result={r} />,
  get_dashboard_stats: (r) => <StatsCard result={r} />,
  get_patient_stats: (r) => <StatsCard result={r} />,
};

export function ToolCallCard({ call }: { call: ClientToolCall }) {
  const result = call.result ?? {};
  if (call.status === "error") {
    return (
      <ErrorCard
        message={String(result.error ?? "حدث خطأ أثناء تنفيذ العملية")}
      />
    );
  }
  const render = REGISTRY[call.name];
  return (
    <>
      {render ? (
        render(result)
      ) : (
        <GenericToolCard name={call.name} result={result} />
      )}
    </>
  );
}
