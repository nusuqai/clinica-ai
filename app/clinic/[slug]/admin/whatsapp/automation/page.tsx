import { requireActiveMember } from "@/lib/auth";
import PageHeader from "@/components/admin/page-header";
import { getWhatsappConfigStatus } from "@/lib/meta/whatsapp-config";
import AppointmentAutomation from "@/components/admin/whatsapp/appointment-automation";

export default async function WhatsAppAutomationPage() {
  const { clinic } = await requireActiveMember(["ADMIN"]);
  const config = await getWhatsappConfigStatus(clinic.id);

  return (
    <div>
      <PageHeader title="التذكيرات والتقييم" />
      <AppointmentAutomation configured={!!config} />
    </div>
  );
}
