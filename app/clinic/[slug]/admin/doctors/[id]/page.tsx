import { notFound } from "next/navigation";
import Link from "next/link";
import {
  ArrowRight,
  Phone,
  Mail,
  Calendar,
  Activity,
  Stethoscope,
  ListOrdered,
} from "lucide-react";
import { requireActiveMember } from "@/lib/auth";
import { getDoctor, listDoctorRules, getDoctorScheduleDays } from "@/server/services/doctors";
import { listBranches } from "@/server/services/branches";
import { listSpecialtyOptions } from "@/server/services/specialties";
import { listAppointments } from "@/server/services/appointments";
import type { DoctorBranchOption } from "./_components/rules-tab";
import { AppointmentStatusBadge } from "@/components/admin/status-badge";
import RulesTab from "./_components/rules-tab";
import SlotsTab from "./_components/slots-tab";
import QueuePanel from "./_components/queue-panel";
import EditDoctorModal from "../_components/edit-doctor-modal";
import { formatSlotDate, formatSlotTime } from "@/lib/slot-time";

const TABS = [
  { key: "appointments", label: "المواعيد", icon: Calendar },
  { key: "rules", label: "قواعد التوفر", icon: Activity },
  { key: "slots", label: "المواعيد المتاحة", icon: Stethoscope },
  { key: "queue", label: "الدور", icon: ListOrdered },
] as const;

type Tab = (typeof TABS)[number]["key"];

interface PageProps {
  params: Promise<{ slug: string; id: string }>;
  searchParams: Promise<{ tab?: string }>;
}

export default async function DoctorDetailsPage({ params, searchParams }: PageProps) {
  const { slug, id } = await params;
  const { tab } = await searchParams;
  const activeTab: Tab = (TABS.map((t) => t.key) as string[]).includes(tab ?? "")
    ? (tab as Tab)
    : "appointments";

  const { clinic } = await requireActiveMember(["ADMIN"]);
  const doctor = await getDoctor(id, clinic.id);
  if (!doctor) notFound();

  const [branchRows, specialties] = await Promise.all([
    listBranches(clinic.id, { activeOnly: true }),
    listSpecialtyOptions(clinic.id),
  ]);
  const branchHours = (b: (typeof branchRows)[number]) =>
    b.hours.map((h) => ({
      dayOfWeek: h.dayOfWeek,
      isClosed: h.isClosed,
      openTime: h.openTime,
      closeTime: h.closeTime,
    }));
  // Branch options for the edit modal include hours so its inline availability
  // editor can hint each branch's opening window.
  const branchOptions = branchRows.map((b) => ({
    id: b.id,
    name: b.name,
    hours: branchHours(b),
  }));
  // Branches this doctor works at, with hours — powers the rules editor helper.
  const doctorBranches: DoctorBranchOption[] = branchRows
    .filter((b) => doctor.branchIds.includes(b.id))
    .map((b) => ({ id: b.id, name: b.name, hours: branchHours(b) }));

  const initials = doctor.profile.fullName
    .split(" ")
    .slice(0, 2)
    .map((n) => n[0])
    .join("");

  return (
    <div>
      {/* Back */}
      <Link
        href={`/admin/doctors`}
        className="mb-6 inline-flex items-center gap-1.5 font-sans text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowRight className="h-4 w-4" />
        العودة إلى الأطباء
      </Link>

      {/* Doctor header card */}
      <div className="mb-6 rounded-2xl border border-border bg-card p-6">
        <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center">
          <div className="flex h-16 w-16 flex-shrink-0 items-center justify-center rounded-2xl bg-primary/10">
            <span className="font-sans text-xl font-bold text-primary">{initials}</span>
          </div>
          <div className="min-w-0 flex-1">
            <div className="mb-1 flex flex-wrap items-center gap-2">
              <h1 className="font-heading text-2xl font-bold text-foreground">
                {doctor.profile.fullName}
              </h1>
              <span
                className={[
                  "inline-flex items-center rounded-full px-2.5 py-0.5 font-sans text-xs font-medium",
                  doctor.isActive ? "bg-emerald-100 text-emerald-700" : "bg-gray-100 text-gray-500",
                ].join(" ")}
              >
                {doctor.isActive ? "نشط" : "غير نشط"}
              </span>
            </div>
            <p className="font-sans text-muted-foreground">{doctor.specialty}</p>
            <div className="mt-2 flex flex-wrap items-center gap-4">
              {doctor.email && (
                <span
                  className="flex items-center gap-1.5 font-sans text-sm text-muted-foreground"
                  dir="ltr"
                >
                  <Mail className="h-3.5 w-3.5" />
                  {doctor.email}
                </span>
              )}
              {doctor.profile.phone && (
                <span
                  className="flex items-center gap-1.5 font-sans text-sm text-muted-foreground"
                  dir="ltr"
                >
                  <Phone className="h-3.5 w-3.5" />
                  {doctor.profile.phone}
                </span>
              )}
              {doctor.examinationFee && (
                <span className="font-sans text-sm text-muted-foreground">
                  {String(doctor.examinationFee)} ر.س / كشف
                </span>
              )}
              {doctor.consultationFee && (
                <span className="font-sans text-sm text-muted-foreground">
                  {String(doctor.consultationFee)} ر.س / استشارة
                </span>
              )}
              {doctor.yearsOfExperience != null && (
                <span className="font-sans text-sm text-muted-foreground">
                  {doctor.yearsOfExperience} سنة خبرة
                </span>
              )}
              <span className="font-sans text-sm text-muted-foreground">
                {doctor._count.appointments} موعد إجمالاً
              </span>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {doctor.title && (
                <span className="rounded-full bg-primary/10 px-2 py-0.5 font-sans text-xs font-medium text-primary">
                  {doctor.title === "CONSULTANT" ? "استشاري" : "أخصائي"}
                </span>
              )}
              {doctor.acceptsChildren && (
                <span className="rounded-full bg-sky-100 px-2 py-0.5 font-sans text-xs font-medium text-sky-700">
                  يكشف على الأطفال
                </span>
              )}
              <span className="rounded-full bg-muted px-2 py-0.5 font-sans text-xs font-medium text-muted-foreground">
                {doctor.requiresAdvanceBooking ? "يحتاج حجزاً مسبقاً" : "يقبل بدون حجز مسبق"}
              </span>
            </div>
            {doctor.qualifications && (
              <p className="mt-2 max-w-xl font-sans text-sm text-muted-foreground">
                <span className="font-medium text-foreground">المؤهلات العلمية: </span>
                {doctor.qualifications}
              </p>
            )}
            {doctor.expertiseAreas && (
              <p className="mt-1 max-w-xl font-sans text-sm text-muted-foreground">
                <span className="font-medium text-foreground">مجالات الخبرة الدقيقة: </span>
                {doctor.expertiseAreas}
              </p>
            )}
            {doctor.bio && (
              <p className="mt-2 max-w-xl font-sans text-sm text-muted-foreground">{doctor.bio}</p>
            )}
          </div>
          <div className="flex-shrink-0">
            <EditDoctorModal doctor={doctor} branches={branchOptions} specialties={specialties} />
          </div>
        </div>
      </div>

      {/* Tab nav */}
      <div className="mb-6 flex w-fit gap-1 rounded-xl border border-border bg-muted/40 p-1">
        {TABS.map(({ key, label, icon: Icon }) => (
          <Link
            key={key}
            href={`/admin/doctors/${id}?tab=${key}`}
            className={[
              "flex items-center gap-2 rounded-lg px-4 py-2 font-sans text-sm font-medium transition-all",
              activeTab === key
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            ].join(" ")}
          >
            <Icon className="h-4 w-4" />
            {label}
          </Link>
        ))}
      </div>

      {/* Tab content — each fetches only what it needs */}
      {activeTab === "appointments" && <AppointmentsContent doctorId={id} />}
      {activeTab === "rules" && (
        <RulesContent doctorId={id} branches={doctorBranches} clinicId={clinic.id} />
      )}
      {activeTab === "slots" && <SlotsContent doctorId={id} />}
      {activeTab === "queue" && <QueuePanel doctorId={id} />}
    </div>
  );
}

// ─── Per-tab server components ────────────────────────────────────────────────

async function AppointmentsContent({ doctorId }: { doctorId: string }) {
  const { clinic } = await requireActiveMember(["ADMIN"]);
  const appointments = await listAppointments(clinic.id, { doctorId });

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card">
      <div className="border-b border-border px-6 py-4">
        <p className="font-sans text-sm text-muted-foreground">{appointments.length} موعد</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full font-sans text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/40">
              <th className="px-4 py-3 text-start font-medium text-muted-foreground">المريض</th>
              <th className="px-4 py-3 text-start font-medium text-muted-foreground">التاريخ</th>
              <th className="px-4 py-3 text-start font-medium text-muted-foreground">الوقت</th>
              <th className="px-4 py-3 text-start font-medium text-muted-foreground">الحالة</th>
              <th className="px-4 py-3 text-start font-medium text-muted-foreground">ملاحظات</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {appointments.length === 0 && (
              <tr>
                <td colSpan={5} className="py-12 text-center text-muted-foreground">
                  لا توجد مواعيد لهذا الطبيب
                </td>
              </tr>
            )}
            {appointments.map((appt) => {
              return (
                <tr key={appt.id} className="transition-colors hover:bg-muted/30">
                  <td className="px-4 py-3 font-medium text-foreground">{appt.patient.fullName}</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {appt.slot
                      ? formatSlotDate(appt.slot.date)
                      : appt.bookingDate
                        ? formatSlotDate(appt.bookingDate)
                        : "—"}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground" dir="ltr">
                    {appt.slot ? (
                      <>
                        {formatSlotTime(appt.slot.startTime)}
                        {" – "}
                        {formatSlotTime(appt.slot.endTime)}
                      </>
                    ) : appt.orderNumber != null ? (
                      <span dir="rtl">دور رقم {appt.orderNumber}</span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <AppointmentStatusBadge status={appt.status} />
                  </td>
                  <td className="max-w-[200px] truncate px-4 py-3 text-muted-foreground">
                    {appt.patientNotes ?? "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

async function RulesContent({
  doctorId,
  branches,
  clinicId,
}: {
  doctorId: string;
  branches: DoctorBranchOption[];
  clinicId: string;
}) {
  const rules = await listDoctorRules(doctorId);
  return <RulesTab doctorId={doctorId} rules={rules} branches={branches} clinicId={clinicId} />;
}

async function SlotsContent({ doctorId }: { doctorId: string }) {
  const days = await getDoctorScheduleDays(doctorId);
  return <SlotsTab doctorId={doctorId} days={days} />;
}
