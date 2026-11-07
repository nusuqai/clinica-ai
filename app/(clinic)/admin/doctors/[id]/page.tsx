import { Suspense } from "react";
import { notFound } from "next/navigation";
import Link from "next/link";
import LinkTabs from "@/components/general/link-tabs";
import {
  ArrowRight,
  Phone,
  Mail,
  Calendar,
  Activity,
  Stethoscope,
  ListOrdered,
} from "lucide-react";
import { requirePermission } from "@/lib/auth";
import { getDoctor, listDoctorRules, getDoctorScheduleDays } from "@/server/services/doctors";
import { branchesInScope, listBranches } from "@/server/services/branches";
import type { BranchScope } from "@/lib/branch-scope";
import { listSpecialtyOptions } from "@/server/services/specialties";
import { appointmentsPageAction } from "@/server/actions/admin";
import type { DoctorBranchOption } from "./_components/rules-tab";
import RulesTab from "./_components/rules-tab";
import SlotsTab from "./_components/slots-tab";
import QueuePanel from "./_components/queue-panel";
import DoctorAppointmentsTab from "./_components/appointments-tab";
import { AppointmentStatus } from "@prisma/client";
import { FilterBar } from "@/components/ui/filter-bar";
import { APPOINTMENT_STATUS_LABELS } from "@/lib/labels";
import EditDoctorModal from "../_components/edit-doctor-modal";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ListCardSkeleton, TableSkeleton } from "@/components/ui/skeleton";
import { PendingNavigationProvider, PendingSwap } from "@/components/general/pending-navigation";

const TABS = [
  { key: "appointments", label: "المواعيد", icon: Calendar },
  { key: "rules", label: "قواعد التوفر", icon: Activity },
  { key: "slots", label: "المواعيد المتاحة", icon: Stethoscope },
  { key: "queue", label: "الدور", icon: ListOrdered },
] as const;

type Tab = (typeof TABS)[number]["key"];

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string; status?: string; date?: string }>;
}

export default async function DoctorDetailsPage({ params, searchParams }: PageProps) {
  const { id } = await params;
  const { tab, status, date } = await searchParams;
  const activeTab: Tab = (TABS.map((t) => t.key) as string[]).includes(tab ?? "")
    ? (tab as Tab)
    : "appointments";

  const { clinic, branchIds: scope } = await requirePermission("doctors");
  // A branch-limited member only reaches doctors who work at their branches,
  // and everything below (branch options, rules, days) is cut to those branches.
  const doctor = await getDoctor(id, clinic.id, scope);
  if (!doctor) notFound();

  const [branchRows, specialties] = await Promise.all([
    listBranches(clinic.id, { activeOnly: true }).then((rows) => branchesInScope(rows, scope)),
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
      <Card className="mb-6 p-6">
        <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center">
          <Avatar className="h-16 w-16 rounded-2xl">
            <AvatarFallback className="rounded-2xl bg-primary/10 font-sans text-xl font-bold text-primary">
              {initials}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <div className="mb-1 flex flex-wrap items-center gap-2">
              <h1 className="font-heading text-2xl font-bold text-foreground">
                {doctor.profile.fullName}
              </h1>
              <Badge variant={doctor.isActive ? "success" : "neutral"}>
                {doctor.isActive ? "نشط" : "غير نشط"}
              </Badge>
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
                <Badge className="px-2">
                  {doctor.title === "CONSULTANT" ? "استشاري" : "أخصائي"}
                </Badge>
              )}
              {doctor.acceptsChildren && (
                <Badge variant="sky" className="px-2">
                  يكشف على الأطفال
                </Badge>
              )}
              <Badge variant="muted" className="px-2">
                {doctor.requiresAdvanceBooking ? "يحتاج حجزاً مسبقاً" : "يقبل بدون حجز مسبق"}
              </Badge>
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
      </Card>

      <LinkTabs
        value={activeTab}
        tabs={TABS.map(({ key, label, icon: Icon }) => ({
          value: key,
          label,
          href: `/admin/doctors/${id}?tab=${key}`,
          icon: <Icon />,
        }))}
        skeletons={{
          appointments: <TableSkeleton columns={5} rows={6} />,
          rules: <ListCardSkeleton rows={4} />,
          slots: <ListCardSkeleton rows={5} />,
          queue: <ListCardSkeleton rows={4} />,
        }}
      >
        {/* Tab content — each fetches only what it needs, behind its own
            Suspense boundary: the header and tabs stay put and only the panel
            falls back to a skeleton. Keys include the filters so a filter change
            (same route, new search params) shows the fallback too. */}
        {activeTab === "appointments" && (
          <PendingNavigationProvider>
            <FilterBar
              fields={[
                {
                  type: "select",
                  param: "status",
                  allLabel: "كل الحالات",
                  options: Object.values(AppointmentStatus).map((s) => ({
                    value: s,
                    label: APPOINTMENT_STATUS_LABELS[s],
                  })),
                },
                { type: "date", param: "date" },
              ]}
            />
            <PendingSwap fallback={<TableSkeleton columns={5} rows={6} />}>
              <Suspense
                key={`appointments:${status ?? ""}:${date ?? ""}`}
                fallback={<TableSkeleton columns={5} rows={6} />}
              >
                <AppointmentsContent
                  doctorId={id}
                  filters={{ status: status as AppointmentStatus | undefined, date }}
                />
              </Suspense>
            </PendingSwap>
          </PendingNavigationProvider>
        )}
        {activeTab === "rules" && (
          <Suspense key="rules" fallback={<ListCardSkeleton rows={4} />}>
            <RulesContent
              doctorId={id}
              branches={doctorBranches}
              clinicId={clinic.id}
              scope={scope}
            />
          </Suspense>
        )}
        {activeTab === "slots" && (
          <Suspense key="slots" fallback={<ListCardSkeleton rows={5} />}>
            <SlotsContent doctorId={id} scope={scope} />
          </Suspense>
        )}
        {activeTab === "queue" && <QueuePanel doctorId={id} />}
      </LinkTabs>
    </div>
  );
}

// ─── Per-tab server components ────────────────────────────────────────────────

async function AppointmentsContent({
  doctorId,
  filters,
}: {
  doctorId: string;
  filters: { status?: AppointmentStatus; date?: string };
}) {
  const initial = await appointmentsPageAction({ ...filters, doctorId }, 1);
  return <DoctorAppointmentsTab doctorId={doctorId} filters={filters} initial={initial} />;
}

async function RulesContent({
  doctorId,
  branches,
  clinicId,
  scope,
}: {
  doctorId: string;
  branches: DoctorBranchOption[];
  clinicId: string;
  scope: BranchScope;
}) {
  const rules = await listDoctorRules(doctorId, clinicId, scope);
  return <RulesTab doctorId={doctorId} rules={rules} branches={branches} clinicId={clinicId} />;
}

async function SlotsContent({ doctorId, scope }: { doctorId: string; scope: BranchScope }) {
  const days = await getDoctorScheduleDays(doctorId, 30, scope);
  return <SlotsTab doctorId={doctorId} days={days} />;
}
