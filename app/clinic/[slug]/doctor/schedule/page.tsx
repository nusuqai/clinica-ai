import { redirect } from "next/navigation";
import Link from "next/link";
import { Activity, CalendarClock } from "lucide-react";
import { requireClinicMember } from "@/lib/auth";
import { listDoctorRules, listDoctorSlots, getDoctorByProfileId } from "@/server/services/doctors";
import { listBranches } from "@/server/services/branches";
import DoctorRulesTab, { type DoctorBranchOption } from "./_components/doctor-rules-tab";
import DoctorSlotsTab from "./_components/doctor-slots-tab";

const TABS = [
  { key: "rules", label: "قواعد التوفر", icon: Activity },
  { key: "slots", label: "المواعيد المتاحة", icon: CalendarClock },
] as const;

type Tab = (typeof TABS)[number]["key"];

interface PageProps {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ tab?: string }>;
}

export default async function DoctorSchedulePage({ params, searchParams }: PageProps) {
  const { slug } = await params;
  const ctx = await requireClinicMember(slug, ["DOCTOR"]);
  const doctor = await getDoctorByProfileId(ctx.user.id, ctx.clinic.id);
  if (!doctor) redirect(`/`);

  const { tab } = await searchParams;
  const activeTab: Tab = (TABS.map((t) => t.key) as string[]).includes(tab ?? "")
    ? (tab as Tab)
    : "rules";

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <h1 className="font-heading text-2xl font-bold text-foreground">جدول العمل</h1>
        <p className="mt-1 font-sans text-sm text-muted-foreground">
          أدِر قواعد توفرك ومواعيدك المتاحة
        </p>
      </div>

      {/* Tab nav */}
      <div className="mb-6 flex w-fit gap-1 rounded-xl border border-border bg-muted/40 p-1">
        {TABS.map(({ key, label, icon: Icon }) => (
          <Link
            key={key}
            href={`/doctor/schedule?tab=${key}`}
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

      {/* Tab content */}
      {activeTab === "rules" && (
        <RulesContent doctorId={doctor.id} clinicId={ctx.clinic.id} branchIds={doctor.branchIds} />
      )}
      {activeTab === "slots" && <SlotsContent doctorId={doctor.id} />}
    </div>
  );
}

async function RulesContent({
  doctorId,
  clinicId,
  branchIds,
}: {
  doctorId: string;
  clinicId: string;
  branchIds: string[];
}) {
  const [rules, branchRows] = await Promise.all([
    listDoctorRules(doctorId),
    listBranches(clinicId, { activeOnly: true }),
  ]);
  const branches: DoctorBranchOption[] = branchRows
    .filter((b) => branchIds.includes(b.id))
    .map((b) => ({
      id: b.id,
      name: b.name,
      hours: b.hours.map((h) => ({
        dayOfWeek: h.dayOfWeek,
        isClosed: h.isClosed,
        openTime: h.openTime,
        closeTime: h.closeTime,
      })),
    }));
  return <DoctorRulesTab rules={rules} branches={branches} />;
}

async function SlotsContent({ doctorId }: { doctorId: string }) {
  const slots = await listDoctorSlots(doctorId);
  return <DoctorSlotsTab slots={slots} />;
}
