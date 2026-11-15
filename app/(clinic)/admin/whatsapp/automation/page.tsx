import { requirePermission } from "@/lib/auth";
import PageHeader from "@/components/admin/page-header";
import { getWhatsappConfigStatus } from "@/lib/meta/whatsapp-config";
import AppointmentAutomation from "@/components/admin/whatsapp/appointment-automation";

export default async function WhatsAppAutomationPage() {
  const { clinic } = await requirePermission("whatsapp");
  const config = await getWhatsappConfigStatus(clinic.id);

  return (
    <div>
      <PageHeader title="التذكيرات والمتابعة والتقييم" />
      {/* Reminders are approved Meta templates — only the official API has them. */}
      <AppointmentAutomation configured={config?.provider === "META_CLOUD"} />
    </div>
  );
}
