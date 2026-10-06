import Link from "next/link";
import { BarChart3 } from "lucide-react";
import { requireClinicMember } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import PageHeader from "@/components/admin/page-header";
import AiSettingsForm from "@/components/admin/ai/ai-settings-form";
import { getClinicAiStatus } from "@/server/services/aiCredit";
import { Button } from "@/components/ui/button";

export default async function AiSettingsPage() {
  const { clinic } = await requireClinicMember(["ADMIN"]);
  const status = await getClinicAiStatus(clinic.id);
  const settings = await prisma.clinic.findUnique({
    where: { id: clinic.id },
    select: { debounceSeconds: true },
  });

  return (
    <div>
      <PageHeader
        title="المساعد الذكي"
        subtitle="تحكّم في الرد الآلي على العملاء وتابع رصيد الوحدات"
        action={
          <Button
            asChild
            variant="outline"
            className="h-auto gap-2 rounded-xl bg-transparent px-3 py-2 text-sm font-normal hover:bg-muted"
          >
            <Link href={`/admin/ai/usage`}>
              <BarChart3 className="h-4 w-4" />
              تقرير الاستهلاك
            </Link>
          </Button>
        }
      />
      <div className="max-w-xl">
        <AiSettingsForm
          initialEnabled={status.aiEnabled}
          initialVoiceReplyEnabled={status.voiceReplyEnabled}
          initialImageAnalysisEnabled={status.imageAnalysisEnabled}
          initialImageAutoReplyEnabled={status.imageAutoReplyEnabled}
          initialDebounceSeconds={settings?.debounceSeconds ?? 15}
          unitBalance={status.unitBalance}
          lowUnits={status.lowUnits}
          sufficient={status.sufficient}
        />
      </div>
    </div>
  );
}
