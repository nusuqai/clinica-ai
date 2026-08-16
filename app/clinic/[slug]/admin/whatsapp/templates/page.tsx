import { requireActiveMember } from "@/lib/auth";
import PageHeader from "@/components/admin/page-header";
import CreateTemplate from "@/components/admin/whatsapp/create-template";
import TemplatesList from "@/components/admin/whatsapp/templates-list";
import { getWhatsappConfigStatus } from "@/lib/meta/whatsapp-config";

export default async function WhatsAppTemplatesPage() {
  const { clinic } = await requireActiveMember(["ADMIN"]);
  const config = await getWhatsappConfigStatus(clinic.id);
  const configured = !!config;

  return (
    <div>
      <PageHeader title="قوالب واتساب" />
      <div className="space-y-6">
        {/* <CreateTemplate disabled={!configured} /> */}
        <TemplatesList disabled={!configured} />
      </div>
    </div>
  );
}
