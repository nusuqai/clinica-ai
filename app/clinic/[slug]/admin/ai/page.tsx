import Link from "next/link";
import { BarChart3 } from "lucide-react";
import { requireActiveMember } from "@/lib/auth";
import PageHeader from "@/components/admin/page-header";
import AiSettingsForm from "@/components/admin/ai/ai-settings-form";
import { getClinicAiStatus } from "@/server/services/aiCredit";

export default async function AiSettingsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { clinic } = await requireActiveMember(["ADMIN"]);
  const status = await getClinicAiStatus(clinic.id);

  return (
    <div>
      <PageHeader
        title="المساعد الذكي"
        subtitle="تحكّم في الرد الآلي على العملاء وتابع رصيد الاستخدام"
        action={
          <Link
            href={`/clinic/${slug}/admin/ai/usage`}
            className="inline-flex items-center gap-2 rounded-xl border border-border px-3 py-2 text-sm text-foreground hover:bg-muted"
          >
            <BarChart3 className="w-4 h-4" />
            تقرير التكاليف
          </Link>
        }
      />
      <div className="max-w-xl">
        <AiSettingsForm
          initialEnabled={status.aiEnabled}
          balance={status.balance.toNumber()}
          lowBalance={status.lowBalance}
          sufficient={status.sufficient}
        />
      </div>
    </div>
  );
}
