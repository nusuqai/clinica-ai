import { redirect } from "next/navigation";
import { Role } from "@prisma/client";
import { requireClinicMember, roleHome } from "@/lib/auth";
import { getClinicWhatsappProviders } from "@/lib/whatsapp/transport";
import { getAssistantAdminView } from "@/server/services/staff/settings";
import PageHeader from "@/components/admin/page-header";
import AssistantSettings from "@/components/admin/staff-assistant/assistant-settings";

// Team assistant settings (#89) — clinic ADMIN only, like team & roles: no
// permission key opens it, so staff can't enable themselves or reroute alerts.
export default async function AssistantSettingsPage() {
  const ctx = await requireClinicMember();
  if (ctx.role !== Role.ADMIN) redirect(roleHome(ctx.role));

  const [view, providers] = await Promise.all([
    getAssistantAdminView(ctx.clinic.id),
    getClinicWhatsappProviders(ctx.clinic.id),
  ]);

  return (
    <div>
      <PageHeader
        title="مساعد الفريق"
        subtitle="إدارة العيادة بالمحادثة من واتساب، وتنبيهات الفريق على واتساب"
      />
      <AssistantSettings view={view} hasOfficialNumber={providers.includes("META_CLOUD")} />
    </div>
  );
}
