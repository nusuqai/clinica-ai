import { requirePermission } from "@/lib/auth";
import PageHeader from "@/components/admin/page-header";
import { getClinicWhatsappProviders } from "@/lib/whatsapp/transport";
import AppointmentAutomation from "@/components/admin/whatsapp/appointment-automation";

export default async function WhatsAppAutomationPage() {
  const { clinic } = await requirePermission("whatsapp");
  const providers = await getClinicWhatsappProviders(clinic.id);
  // Any WhatsApp Web number → clinic-written text (sent from those numbers);
  // only an official number → approved Meta templates.
  const mode = providers.includes("EVOLUTION")
    ? "EVOLUTION"
    : providers.includes("META_CLOUD")
      ? "META_CLOUD"
      : null;

  return (
    <div>
      <PageHeader title="التذكيرات والمتابعة والتقييم" />
      <AppointmentAutomation provider={mode} />
    </div>
  );
}
