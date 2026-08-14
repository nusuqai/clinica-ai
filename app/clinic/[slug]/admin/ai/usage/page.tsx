import { DollarSign, Coins, MessageSquare } from "lucide-react";
import { requireActiveMember } from "@/lib/auth";
import PageHeader from "@/components/admin/page-header";
import StatCard from "@/components/admin/stat-card";
import BarList from "@/components/admin/bar-list";
import { getClinicAiUsage } from "@/server/services/aiReports";

const usd = (n: number) =>
  `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`;

export default async function AiUsagePage() {
  const { clinic } = await requireActiveMember(["ADMIN"]);
  const report = await getClinicAiUsage(clinic.id);

  return (
    <div>
      <PageHeader
        title="تقرير تكاليف المساعد الذكي"
        subtitle={`آخر ${report.windowDays} يوماً`}
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <StatCard
          label="إجمالي التكلفة"
          value={usd(report.totalCharged)}
          icon={DollarSign}
          color="primary"
        />
        <StatCard
          label="عدد الردود"
          value={report.turns}
          icon={MessageSquare}
          color="accent"
        />
        <StatCard
          label="متوسط تكلفة الرد"
          value={usd(report.avgCostPerTurn)}
          icon={Coins}
          color="accent"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-card border border-border rounded-2xl p-6">
          <h2 className="font-heading font-semibold text-foreground mb-6">
            التكلفة اليومية
          </h2>
          {report.byDay.length > 0 ? (
            <BarList
              items={report.byDay.map((d) => ({
                label: d.label,
                sublabel: usd(d.value),
                value: Number(d.value.toFixed(6)),
              }))}
              color="bg-accent"
            />
          ) : (
            <p className="text-sm text-muted-foreground font-sans">
              لا توجد بيانات استخدام بعد.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
