import { requirePlatformAdmin } from "@/lib/auth";
import { getPlatformKnowledgeOverview } from "@/server/services/knowledgeOverview";
import ClinicKnowledge from "./_components/clinic-knowledge";

// The knowledge base every clinic's assistant reads from. Authored here rather
// than by clinic admins: `slug` and `summary` are retrieval tuning (the summary
// is what the model reads to decide whether to open a document), so a poorly
// written one silently stops the agent from ever finding that doc.
export default async function PlatformKnowledgePage() {
  await requirePlatformAdmin();
  const overview = await getPlatformKnowledgeOverview();

  const stats = [
    { label: "إجمالي المستندات", value: overview.totalDocs },
    { label: "عيادات بلا مستندات", value: overview.clinicsWithNoDocs },
  ];

  return (
    <div>
      <div className="mb-6">
        <h1 className="font-heading text-2xl font-bold text-foreground">قاعدة المعرفة</h1>
        <p className="mt-1 font-sans text-sm text-muted-foreground">
          المستندات التي يعتمد عليها المساعد الذكي في كل عيادة. يرى مسؤول العيادة نسخة للاطّلاع فقط.
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
        {overview.clinics.map((c) => (
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
                  c.docs.length > 0
                    ? "bg-emerald-500/10 text-emerald-600"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                {c.docs.length > 0
                  ? `${c.activeCount} مفعّل من ${c.docs.length}`
                  : "لا توجد مستندات"}
              </span>
            </div>
            <ClinicKnowledge clinicId={c.clinicId} docs={c.docs} />
          </div>
        ))}
        {overview.clinics.length === 0 && (
          <p className="font-sans text-sm text-muted-foreground">لا توجد عيادات.</p>
        )}
      </div>
    </div>
  );
}
