import { requireActiveMember } from "@/lib/auth";
import PageHeader from "@/components/admin/page-header";
import WhatsappSettings from "@/components/admin/whatsapp-settings";
import { getWhatsappConfigStatus } from "@/lib/meta/whatsapp-config";

export default async function WhatsAppSetupPage() {
  const { clinic } = await requireActiveMember(["ADMIN"]);
  const config = await getWhatsappConfigStatus(clinic.id);
  const appUrl = process.env.APP_URL ?? "";

  return (
    <div>
      <PageHeader
        title="واتساب والقوالب"
        subtitle="أدخل بيانات WhatsApp Cloud API، وأنشئ وأرسل القوالب المعتمدة من ميتا"
      />
      <WhatsappSettings initialConfig={config} appUrl={appUrl} />
    </div>
  );
}
