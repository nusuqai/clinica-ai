import { Coins, MessageSquare, CalendarClock, MessagesSquare } from "lucide-react";
import { requireClinicMember } from "@/lib/auth";
import PageHeader from "@/components/admin/page-header";
import StatCard from "@/components/admin/stat-card";
import BarList from "@/components/admin/bar-list";
import { getClinicAiUsage } from "@/server/services/aiReports";

// The clinic's view of its AI meter: units, never dollars. One unit = one reply
// the agent sent. What that reply cost to produce is platform accounting and is
// deliberately absent from this page (see /platform/credits for that side).

const units = (n: number) => n.toLocaleString("ar-EG");
const decimal = (n: number) =>
  n.toLocaleString("ar-EG", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

export default async function AiUsagePage() {
  const { clinic } = await requireClinicMember(["ADMIN"]);
  const report = await getClinicAiUsage(clinic.id);

  const spentNothing = report.unitsUsed === 0;

  return (
    <div>
      <PageHeader
        title="استهلاك وحدات المساعد الذكي"
        subtitle={`آخر ${report.windowDays} يوماً — كل رد من المساعد يخصم وحدة واحدة`}
      />

      <div className="mb-8 grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard
          label="الوحدات المتبقية"
          value={units(report.unitBalance)}
          icon={Coins}
          color={!report.unitsSufficient ? "red" : report.lowUnits ? "amber" : "primary"}
        />
        <StatCard
          label="الوحدات المستهلكة"
          value={units(report.unitsUsed)}
          icon={MessageSquare}
          color="accent"
        />
        <StatCard
          label="متوسط الاستهلاك اليومي"
          value={decimal(report.avgUnitsPerDay)}
          icon={CalendarClock}
          color="accent"
        />
        <StatCard
          label="وحدات لكل محادثة"
          value={report.sessions > 0 ? decimal(report.unitsPerSession) : "—"}
          icon={MessagesSquare}
          color="accent"
        />
      </div>

      {/* The one forward-looking number: at this burn rate, how long the
          remaining units last. Hidden entirely when there's nothing to
          extrapolate from, rather than shown as a fake infinity. */}
      {report.projectedDaysLeft !== null && (
        <div
          className={`mb-8 rounded-2xl border p-5 ${
            report.projectedDaysLeft < 7
              ? "border-amber-500/30 bg-amber-500/10"
              : "border-border bg-card"
          }`}
        >
          <p className="font-sans text-sm text-muted-foreground">
            بمعدل الاستهلاك الحالي، تكفي الوحدات المتبقية لمدة تقريبية قدرها{" "}
            <span className="font-heading font-bold text-foreground">
              {decimal(report.projectedDaysLeft)} يوماً
            </span>
            {report.sessions > 0 && (
              <>
                {" "}
                — أي ما يعادل نحو{" "}
                <span className="font-heading font-bold text-foreground">
                  {units(Math.floor(report.unitBalance / Math.max(report.unitsPerSession, 1)))}
                </span>{" "}
                محادثة أخرى.
              </>
            )}
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-border bg-card p-6">
          <h2 className="mb-6 font-heading font-semibold text-foreground">الاستهلاك اليومي</h2>
          {!spentNothing ? (
            <BarList
              items={report.byDay.map((d) => ({
                label: d.label,
                sublabel: "وحدة",
                value: d.value,
              }))}
              color="bg-accent"
            />
          ) : (
            <p className="font-sans text-sm text-muted-foreground">لا يوجد استهلاك بعد.</p>
          )}
        </div>

        <div className="space-y-6">
          <div className="rounded-2xl border border-border bg-card p-6">
            <h2 className="mb-6 font-heading font-semibold text-foreground">حسب القناة</h2>
            {report.byChannel.length > 0 ? (
              <BarList
                items={report.byChannel.map((c) => ({
                  label: c.label,
                  sublabel: "وحدة",
                  value: c.value,
                }))}
              />
            ) : (
              <p className="font-sans text-sm text-muted-foreground">لا يوجد استهلاك بعد.</p>
            )}
          </div>

          {report.busiestDay && (
            <div className="rounded-2xl border border-border bg-card p-6">
              <h2 className="mb-3 font-heading font-semibold text-foreground">
                أعلى يوم استهلاكاً
              </h2>
              <p className="font-heading text-2xl font-bold text-foreground">
                {units(report.busiestDay.value)}{" "}
                <span className="font-sans text-base font-normal text-muted-foreground">وحدة</span>
              </p>
              <p className="mt-1 font-sans text-sm text-muted-foreground" dir="ltr">
                {report.busiestDay.label}
              </p>
            </div>
          )}

          <div className="rounded-2xl border border-border bg-card p-6">
            <h2 className="mb-3 font-heading font-semibold text-foreground">كيف تُحتسب الوحدات؟</h2>
            <ul className="space-y-2 font-sans text-sm text-muted-foreground">
              <li>• كل رد يرسله المساعد الذكي = وحدة واحدة، مهما كان طول الرد.</li>
              <li>• ردود فريق العيادة اليدوية لا تُخصم منها أي وحدة.</li>
              <li>• الرسائل الصوتية تُحتسب كأي رد عادي: وحدة واحدة للرد.</li>
              <li>• عند نفاد الوحدات يتوقف الرد الآلي وتُحوَّل المحادثات إلى فريق العيادة.</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
