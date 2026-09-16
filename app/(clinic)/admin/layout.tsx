import { requireClinicMember } from "@/lib/auth";
import DashboardShell from "@/components/general/dashboard-shell";
import { getUnresolvedEscalationConversationIds } from "@/server/services/messages";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireClinicMember(["ADMIN"]);

  const initialUnresolvedEscalationConversationIds = await getUnresolvedEscalationConversationIds(
    ctx.clinic.id
  );

  return (
    <DashboardShell
      role="admin"
      userFullName={ctx.user.profile.fullName || ctx.user.email || "مسؤول"}
      userEmail={ctx.user.email}
      initialUnresolvedEscalationConversationIds={initialUnresolvedEscalationConversationIds}
      clinicId={ctx.clinic.id}
      clinicName={ctx.clinic.name}
      clinicLogoUrl={ctx.clinic.logoUrl}
      viaPlatformAdmin={ctx.viaPlatformAdmin}
    >
      {children}
    </DashboardShell>
  );
}
