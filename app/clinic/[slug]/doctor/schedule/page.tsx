import { redirect } from "next/navigation";
import Link from "next/link";
import { Activity, CalendarClock } from "lucide-react";
import { requireClinicMember } from "@/lib/auth";
import {
  listDoctorRules,
  listDoctorSlots,
  getDoctorByProfileId,
} from "@/server/services/doctors";
import DoctorRulesTab from "./_components/doctor-rules-tab";
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

export default async function DoctorSchedulePage({
  params,
  searchParams,
}: PageProps) {
  const { slug } = await params;
  const ctx = await requireClinicMember(slug, ["DOCTOR"]);
  const doctor = await getDoctorByProfileId(ctx.user.id, ctx.clinic.id);
  if (!doctor) redirect(`/clinic/${slug}`);
  const base = `/clinic/${slug}`;

  const { tab } = await searchParams;
  const activeTab: Tab = (TABS.map((t) => t.key) as string[]).includes(tab ?? "")
    ? (tab as Tab)
    : "rules";

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <h1 className="font-heading text-2xl font-bold text-foreground">جدول العمل</h1>
        <p className="text-sm text-muted-foreground mt-1 font-sans">
          أدِر قواعد توفرك ومواعيدك المتاحة
        </p>
      </div>

      {/* Tab nav */}
      <div className="flex gap-1 mb-6 bg-muted/40 border border-border rounded-xl p-1 w-fit">
        {TABS.map(({ key, label, icon: Icon }) => (
          <Link
            key={key}
            href={`${base}/doctor/schedule?tab=${key}`}
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

      {/* Tab content */}
      {activeTab === "rules" && <RulesContent doctorId={doctor.id} />}
      {activeTab === "slots" && <SlotsContent doctorId={doctor.id} />}
    </div>
  );
}

async function RulesContent({ doctorId }: { doctorId: string }) {
  const rules = await listDoctorRules(doctorId);
  return <DoctorRulesTab rules={rules} />;
}

async function SlotsContent({ doctorId }: { doctorId: string }) {
  const slots = await listDoctorSlots(doctorId);
  return <DoctorSlotsTab slots={slots} />;
}
