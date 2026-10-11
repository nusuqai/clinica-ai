import { requirePlatformAdmin } from "@/lib/auth";
import { getPlatformAiAgentsOverview } from "@/server/services/aiAgents";
import ClinicAgents from "./_components/clinic-agents";

// Every clinic's AI employees — the named assistants (persona + working hours)
// that answer its patients. Set up here rather than by clinic admins: a persona
// is prompt text, so the platform team owns it like the knowledge base.
export default async function PlatformAgentsPage() {
  await requirePlatformAdmin();
  const overview = await getPlatformAiAgentsOverview();

  const stats = [
    { label: "إجمالي الموظفين الآليين", value: overview.totalAgents },
    { label: "عيادات بلا موظفين آليين", value: overview.clinicsWithNoAgents },
  ];

  return (
    <div>
      <div className="mb-6">
        <h1 className="font-heading text-2xl font-bold text-foreground">الموظفون الآليون</h1>
        <p className="mt-1 font-sans text-sm text-muted-foreground">
          لكل موظف آلي اسم وشخصية ودوام، ولا يتداخل دوام موظفَين في العيادة نفسها. خارج الدوام — أو
          في عيادة بلا موظفين آليين — لا يردّ المساعد وتُحوَّل الرسالة إلى فريق العيادة.
        </p>
      </div>

      <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
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
        {overview.clinics.map((c) => {
          const onShift = c.agents.find((a) => a.onShiftNow);
          return (
            <div key={c.clinicId} className="rounded-2xl border border-border bg-card p-5">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-heading font-semibold text-foreground">{c.name}</p>
                  <p className="font-sans text-xs text-muted-foreground" dir="ltr">
                    /{c.slug}
                  </p>
                </div>
                <span
                  className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                    onShift
                      ? "bg-emerald-500/10 text-emerald-600"
                      : c.agents.length > 0
                        ? "bg-amber-500/10 text-amber-600"
                        : "bg-red-500/10 text-red-600"
                  }`}
                >
                  {onShift
                    ? `في الدوام الآن: ${onShift.name}`
                    : c.agents.length > 0
                      ? "لا أحد في الدوام الآن"
                      : "بلا موظفين — لا يردّ المساعد"}
                </span>
              </div>
              <ClinicAgents clinicId={c.clinicId} agents={c.agents} />
            </div>
          );
        })}
        {overview.clinics.length === 0 && (
          <p className="font-sans text-sm text-muted-foreground">لا توجد عيادات.</p>
        )}
      </div>
    </div>
  );
}
