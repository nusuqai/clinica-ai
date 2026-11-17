import { BadgeCheck, CheckCircle2, LifeBuoy } from "lucide-react";
import { requirePermission } from "@/lib/auth";
import PageHeader from "@/components/admin/page-header";
import { getWhatsappConfigStatus } from "@/lib/meta/whatsapp-config";
import {
  disconnectEvolutionAction,
  getEvolutionStatusAction,
  startEvolutionAction,
  syncEvolutionHistoryAction,
} from "@/server/actions/whatsapp";
import EvolutionConnection from "@/components/admin/whatsapp/evolution-connection";
import { Card } from "@/components/ui/card";

/**
 * A clinic's own WhatsApp connection page.
 *
 *  - Unofficial WhatsApp Web (Evolution) is self-service: the clinic links its
 *    own phone by scanning a QR, and can resync or unlink it.
 *  - The official Cloud API needs a Meta business setup and app secrets, so it
 *    stays platform-admin work — the clinic sees its status and how to reach
 *    Clinica support. Never shows any Meta token.
 */
export default async function WhatsAppConnectionPage() {
  const { clinic } = await requirePermission("whatsapp");
  const config = await getWhatsappConfigStatus(clinic.id);

  if (config?.provider === "META_CLOUD") {
    return (
      <div>
        <PageHeader title="اتصال واتساب" subtitle="حالة ربط رقم واتساب بعيادتك" />
        <div className="max-w-xl">
          <Card className="space-y-4 p-5">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-emerald-600" />
              <span className="font-sans text-sm font-semibold text-foreground">
                عيادتك متصلة بواتساب الرسمي (WhatsApp Business API)
              </span>
            </div>
            <dl className="space-y-3 border-t border-border pt-4">
              <div>
                <dt className="font-sans text-xs text-muted-foreground">آخر تحديث</dt>
                <dd className="font-sans text-sm text-foreground" dir="ltr">
                  {config.updatedAt.toLocaleDateString("en-GB")}
                </dd>
              </div>
            </dl>
            <SupportNote>
              الربط الرسمي يُدار من خلال فريق دعم Clinica. لتغيير الرقم أو تعديل أي إعداد في
              الاتصال، تواصل مع فريق الدعم وسنتولّى ذلك عنك.
            </SupportNote>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="اتصال واتساب"
        subtitle="اربط رقم واتساب عيادتك بنفسك عبر مسح رمز QR من هاتف العيادة"
      />
      <div className="max-w-xl space-y-6">
        <EvolutionConnection
          actions={{
            start: startEvolutionAction,
            status: getEvolutionStatusAction,
            sync: syncEvolutionHistoryAction,
            disconnect: disconnectEvolutionAction,
          }}
          configured={config?.provider === "EVOLUTION"}
        />

        <Card className="space-y-2 p-5">
          <h2 className="flex items-center gap-2 font-sans text-sm font-semibold text-foreground">
            <BadgeCheck className="h-4 w-4 text-accent" />
            تفضّل الربط الرسمي؟
          </h2>
          <p className="text-xs leading-relaxed text-muted-foreground">
            واتساب الرسمي (WhatsApp Business API من ميتا) أكثر استقرارًا، لا يعرّض رقمك للحظر، ويدعم
            القوالب المعتمدة لإرسال التذكيرات في أي وقت. يحتاج إعداده حسابًا تجاريًا لدى ميتا.
          </p>
          <SupportNote>تواصل مع فريق دعم Clinica وسنجهّز لك الربط الرسمي بالكامل.</SupportNote>
        </Card>
      </div>
    </div>
  );
}

function SupportNote({ children }: { children: React.ReactNode }) {
  return (
    <p className="flex gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs leading-relaxed text-muted-foreground">
      <LifeBuoy className="mt-0.5 h-4 w-4 shrink-0" />
      <span>{children}</span>
    </p>
  );
}
