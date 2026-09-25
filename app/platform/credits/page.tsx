import { requirePlatformAdmin } from "@/lib/auth";
import { getPlatformAiOverview } from "@/server/services/aiReports";
import CreditManager from "./_components/credit-manager";

const usd = (n: number) =>
  `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`;

// Cost per unit is a fraction of a cent, so it needs more precision than a
// balance does — rounded to 2 dp it would read as $0.00 for every clinic.
const usdPrecise = (n: number) =>
  `$${n.toLocaleString("en-US", { minimumFractionDigits: 4, maximumFractionDigits: 6 })}`;

const count = (n: number) => n.toLocaleString("en-US");

export default async function PlatformCreditsPage() {
  await requirePlatformAdmin();
  const overview = await getPlatformAiOverview();

  // Units first (what clinics hold), then the USD those units really cost us.
  const stats = [
    { label: "إجمالي الوحدات لدى العيادات", value: count(overview.totalUnitBalance) },
    {
      label: `الوحدات المستهلكة (${overview.windowDays}ي)`,
      value: count(overview.totalUnitsUsedWindow),
    },
    {
      label: `التكلفة الفعلية (${overview.windowDays}ي)`,
      value: usd(overview.totalRawSpendWindow),
    },
    {
      label: "التكلفة الفعلية للوحدة",
      value: overview.rawCostPerUnit === null ? "—" : usdPrecise(overview.rawCostPerUnit),
    },
    { label: "عيادات بوحدات منخفضة", value: overview.lowUnitsCount },
  ];

  return (
    <div>
      <h1 className="mb-6 font-heading text-2xl font-bold text-foreground">
        أرصدة وتكاليف المساعد الذكي
      </h1>

      <div className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-3">
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
                {/* What the clinic sees */}
                <div className="text-right">
                  <p className="font-sans text-xs text-muted-foreground">الوحدات</p>
                  <p
                    className={`font-semibold ${c.lowUnits ? "text-red-600" : "text-foreground"}`}
                    dir="ltr"
                  >
                    {count(c.unitBalance)}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-sans text-xs text-muted-foreground">
                    استهلاك {overview.windowDays}ي
                  </p>
                  <p className="font-semibold text-foreground" dir="ltr">
                    {count(c.unitsUsedWindow)}
                  </p>
                </div>
                {/* What it actually cost us — platform-only */}
                <div className="text-right">
                  <p className="font-sans text-xs text-muted-foreground">التكلفة الفعلية</p>
                  <p className="font-semibold text-foreground" dir="ltr">
                    {usd(c.rawSpendWindow)}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-sans text-xs text-muted-foreground">تكلفة الوحدة</p>
                  <p className="font-semibold text-foreground" dir="ltr">
                    {c.rawCostPerUnit === null ? "—" : usdPrecise(c.rawCostPerUnit)}
                  </p>
                </div>
              </div>
            </div>
            <CreditManager
              clinicId={c.clinicId}
              currentMarkup={c.markup}
              currentLowUnitsThreshold={c.lowUnitsThreshold}
            />
          </div>
        ))}
        {overview.clinics.length === 0 && (
          <p className="font-sans text-sm text-muted-foreground">لا توجد عيادات.</p>
        )}
      </div>
    </div>
  );
}
