import { redirect } from "next/navigation";
import Link from "next/link";
import { Activity, CalendarClock } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { listDoctorRules, listDoctorSlots } from "@/server/services/doctors";
import DoctorRulesTab from "./_components/doctor-rules-tab";
import DoctorSlotsTab from "./_components/doctor-slots-tab";

const TABS = [
  { key: "rules", label: "قواعد التوفر", icon: Activity },
  { key: "slots", label: "المواعيد المتاحة", icon: CalendarClock },
] as const;

type Tab = (typeof TABS)[number]["key"];

interface PageProps {
  searchParams: Promise<{ tab?: string }>;
}

export default async function DoctorSchedulePage({ searchParams }: PageProps) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

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
            href={`/doctor/schedule?tab=${key}`}
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
      {activeTab === "rules" && <RulesContent doctorId={user.id} />}
      {activeTab === "slots" && <SlotsContent doctorId={user.id} />}
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
