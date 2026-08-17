import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowRight, Phone, Mail, Calendar, Activity, Stethoscope } from "lucide-react";
import { requireActiveMember } from "@/lib/auth";
import { getDoctor, listDoctorRules, listDoctorSlots } from "@/server/services/doctors";
import { listBranches } from "@/server/services/branches";
import { listSpecialtyOptions } from "@/server/services/specialties";
import { listAppointments } from "@/server/services/appointments";
import type { DoctorBranchOption } from "./_components/rules-tab";
import { AppointmentStatusBadge } from "@/components/admin/status-badge";
import RulesTab from "./_components/rules-tab";
import SlotsTab from "./_components/slots-tab";
import EditDoctorModal from "../_components/edit-doctor-modal";
import { formatSlotDate, formatSlotTime } from "@/lib/slot-time";

const TABS = [
  { key: "appointments", label: "المواعيد", icon: Calendar },
  { key: "rules", label: "قواعد التوفر", icon: Activity },
  { key: "slots", label: "المواعيد المتاحة", icon: Stethoscope },
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
  const base = `/clinic/${slug}`;
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
        href={`${base}/admin/doctors`}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-6 font-sans"
      >
        <ArrowRight className="w-4 h-4" />
        العودة إلى الأطباء
      </Link>

      {/* Doctor header card */}
      <div className="bg-card border border-border rounded-2xl p-6 mb-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
          <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center flex-shrink-0">
            <span className="text-xl font-bold text-primary font-sans">{initials}</span>
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <h1 className="font-heading text-2xl font-bold text-foreground">
                {doctor.profile.fullName}
              </h1>
              <span
                className={[
                  "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium font-sans",
                  doctor.isActive
                    ? "bg-emerald-100 text-emerald-700"
                    : "bg-gray-100 text-gray-500",
                ].join(" ")}
              >
                {doctor.isActive ? "نشط" : "غير نشط"}
              </span>
            </div>
            <p className="text-muted-foreground font-sans">{doctor.specialty}</p>
            <div className="flex flex-wrap items-center gap-4 mt-2">
              {doctor.email && (
                <span
                  className="flex items-center gap-1.5 text-sm text-muted-foreground font-sans"
                  dir="ltr"
                >
                  <Mail className="w-3.5 h-3.5" />
                  {doctor.email}
                </span>
              )}
              {doctor.profile.phone && (
                <span
                  className="flex items-center gap-1.5 text-sm text-muted-foreground font-sans"
                  dir="ltr"
                >
                  <Phone className="w-3.5 h-3.5" />
                  {doctor.profile.phone}
                </span>
              )}
              {doctor.examinationFee && (
                <span className="text-sm text-muted-foreground font-sans">
                  {String(doctor.examinationFee)} ر.س / كشف
                </span>
              )}
              {doctor.consultationFee && (
                <span className="text-sm text-muted-foreground font-sans">
                  {String(doctor.consultationFee)} ر.س / استشارة
                </span>
              )}
              {doctor.yearsOfExperience != null && (
                <span className="text-sm text-muted-foreground font-sans">
                  {doctor.yearsOfExperience} سنة خبرة
                </span>
              )}
              <span className="text-sm text-muted-foreground font-sans">
                {doctor._count.appointments} موعد إجمالاً
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-2 mt-2">
              {doctor.title && (
                <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-primary/10 text-primary font-sans">
                  {doctor.title === "CONSULTANT" ? "استشاري" : "أخصائي"}
                </span>
              )}
              {doctor.acceptsChildren && (
                <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-sky-100 text-sky-700 font-sans">
                  يكشف على الأطفال
                </span>
              )}
              <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-muted text-muted-foreground font-sans">
                {doctor.requiresAdvanceBooking ? "يحتاج حجزاً مسبقاً" : "يقبل بدون حجز مسبق"}
              </span>
            </div>
            {doctor.qualifications && (
              <p className="text-sm text-muted-foreground mt-2 font-sans max-w-xl">
                <span className="font-medium text-foreground">المؤهلات العلمية: </span>
                {doctor.qualifications}
              </p>
            )}
            {doctor.expertiseAreas && (
              <p className="text-sm text-muted-foreground mt-1 font-sans max-w-xl">
                <span className="font-medium text-foreground">مجالات الخبرة الدقيقة: </span>
                {doctor.expertiseAreas}
              </p>
            )}
            {doctor.bio && (
              <p className="text-sm text-muted-foreground mt-2 font-sans max-w-xl">{doctor.bio}</p>
            )}
          </div>
          <div className="flex-shrink-0">
            <EditDoctorModal
              doctor={doctor}
              branches={branchOptions}
              specialties={specialties}
            />
          </div>
        </div>
      </div>

      {/* Tab nav */}
      <div className="flex gap-1 mb-6 bg-muted/40 border border-border rounded-xl p-1 w-fit">
        {TABS.map(({ key, label, icon: Icon }) => (
          <Link
            key={key}
            href={`${base}/admin/doctors/${id}?tab=${key}`}
            className={[
              "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium font-sans transition-all",
              activeTab === key
                ? "bg-card shadow-sm text-foreground"
                : "text-muted-foreground hover:text-foreground",
            ].join(" ")}
          >
            <Icon className="w-4 h-4" />
            {label}
          </Link>
        ))}
      </div>

      {/* Tab content — each fetches only what it needs */}
      {activeTab === "appointments" && <AppointmentsContent doctorId={id} />}
      {activeTab === "rules" && (
        <RulesContent doctorId={id} branches={doctorBranches} />
      )}
      {activeTab === "slots" && <SlotsContent doctorId={id} />}
    </div>
  );
}

// ─── Per-tab server components ────────────────────────────────────────────────

async function AppointmentsContent({ doctorId }: { doctorId: string }) {
  const { clinic } = await requireActiveMember(["ADMIN"]);
  const appointments = await listAppointments(clinic.id, { doctorId });

  return (
    <div className="bg-card border border-border rounded-2xl overflow-hidden">
      <div className="px-6 py-4 border-b border-border">
        <p className="text-sm text-muted-foreground font-sans">{appointments.length} موعد</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm font-sans">
          <thead>
            <tr className="border-b border-border bg-muted/40">
              <th className="text-start px-4 py-3 font-medium text-muted-foreground">المريض</th>
              <th className="text-start px-4 py-3 font-medium text-muted-foreground">التاريخ</th>
              <th className="text-start px-4 py-3 font-medium text-muted-foreground">الوقت</th>
              <th className="text-start px-4 py-3 font-medium text-muted-foreground">الحالة</th>
              <th className="text-start px-4 py-3 font-medium text-muted-foreground">ملاحظات</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {appointments.length === 0 && (
              <tr>
                <td colSpan={5} className="text-center py-12 text-muted-foreground">
                  لا توجد مواعيد لهذا الطبيب
                </td>
              </tr>
            )}
            {appointments.map((appt) => {
              return (
                <tr key={appt.id} className="hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-3 font-medium text-foreground">{appt.patient.fullName}</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {formatSlotDate(appt.slot.date)}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground" dir="ltr">
                    {formatSlotTime(appt.slot.startTime)}
                    {" – "}
                    {formatSlotTime(appt.slot.endTime)}
                  </td>
                  <td className="px-4 py-3">
                    <AppointmentStatusBadge status={appt.status} />
                  </td>
                  <td className="px-4 py-3 text-muted-foreground max-w-[200px] truncate">
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
}: {
  doctorId: string;
  branches: DoctorBranchOption[];
}) {
  const rules = await listDoctorRules(doctorId);
  return <RulesTab doctorId={doctorId} rules={rules} branches={branches} />;
}

async function SlotsContent({ doctorId }: { doctorId: string }) {
  const slots = await listDoctorSlots(doctorId);
  return <SlotsTab doctorId={doctorId} slots={slots} />;
}
