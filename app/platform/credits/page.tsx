import { requirePlatformAdmin } from "@/lib/auth";
import { getPlatformAiOverview } from "@/server/services/aiReports";
import CreditManager from "./_components/credit-manager";

const usd = (n: number) =>
  `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`;

export default async function PlatformCreditsPage() {
  await requirePlatformAdmin();
  const overview = await getPlatformAiOverview();

  const stats = [
    { label: "إجمالي الأرصدة", value: usd(overview.totalBalance) },
    { label: `الإنفاق (آخر ${overview.windowDays} يوماً)`, value: usd(overview.totalSpendWindow) },
    { label: "عيادات برصيد منخفض", value: overview.lowBalanceCount },
  ];

  return (
    <div>
      <h1 className="mb-6 font-heading text-2xl font-bold text-foreground">
        أرصدة وتكاليف المساعد الذكي
      </h1>

      <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
        {stats.map((s) => (
          <div key={s.label} className="rounded-2xl border border-border bg-card p-5">
            <p className="font-heading text-2xl font-bold text-foreground" dir="ltr">
              {s.value}
            </p>
            <p className="mt-1 font-sans text-sm text-muted-foreground">{s.label}</p>
          </div>
        ))}
      </div>

      <div className="space-y-4">
        {overview.clinics.map((c) => (
          <div key={c.clinicId} className="rounded-2xl border border-border bg-card p-5">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-heading font-semibold text-foreground">{c.name}</p>
                <p className="font-sans text-xs text-muted-foreground" dir="ltr">
                  /{c.slug}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-4 text-sm">
                <span
                  className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                    c.aiEnabled
                      ? "bg-emerald-500/10 text-emerald-600"
                      : "bg-muted text-muted-foreground"
                  }`}
                >
                  {c.aiEnabled ? "المساعد مفعّل" : "المساعد موقوف"}
                </span>
                <div className="text-right">
                  <p className="font-sans text-xs text-muted-foreground">الرصيد</p>
                  <p
                    className={`font-semibold ${c.lowBalance ? "text-red-600" : "text-foreground"}`}
                    dir="ltr"
                  >
                    {usd(c.balance)}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-sans text-xs text-muted-foreground">
                    إنفاق {overview.windowDays}ي
                  </p>
                  <p className="font-semibold text-foreground" dir="ltr">
                    {usd(c.spendWindow)}
                  </p>
                </div>
              </div>
            </div>
            <CreditManager clinicId={c.clinicId} currentMarkup={c.markup} />
          </div>
        ))}
        {overview.clinics.length === 0 && (
          <p className="font-sans text-sm text-muted-foreground">لا توجد عيادات.</p>
        )}
      </div>
    </div>
  );
}
