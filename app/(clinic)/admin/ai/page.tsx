import Link from "next/link";
import { BarChart3 } from "lucide-react";
import { requireClinicMember } from "@/lib/auth";
import PageHeader from "@/components/admin/page-header";
import AiSettingsForm from "@/components/admin/ai/ai-settings-form";
import { getClinicAiStatus } from "@/server/services/aiCredit";

export default async function AiSettingsPage() {
  const { clinic } = await requireClinicMember(["ADMIN"]);
  const status = await getClinicAiStatus(clinic.id);

  return (
    <div>
      <PageHeader
        title="المساعد الذكي"
        subtitle="تحكّم في الرد الآلي على العملاء وتابع رصيد الوحدات"
        action={
          <Link
            href={`/admin/ai/usage`}
            className="inline-flex items-center gap-2 rounded-xl border border-border px-3 py-2 text-sm text-foreground hover:bg-muted"
          >
            <BarChart3 className="h-4 w-4" />
            تقرير الاستهلاك
          </Link>
        }
      />
      <div className="max-w-xl">
        <AiSettingsForm
          initialEnabled={status.aiEnabled}
          initialVoiceReplyEnabled={status.voiceReplyEnabled}
          unitBalance={status.unitBalance}
          lowUnits={status.lowUnits}
          sufficient={status.sufficient}
        />
      </div>
    </div>
  );
}
