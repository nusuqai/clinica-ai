import { requireClinicMember } from "@/lib/auth";
import DashboardShell from "@/components/general/dashboard-shell";
import { getUnresolvedEscalationConversationIds } from "@/server/services/messages";
import { getClinicUnitSummary } from "@/server/services/aiCredit";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireClinicMember(["ADMIN"]);

  const [initialUnresolvedEscalationConversationIds, units] = await Promise.all([
    getUnresolvedEscalationConversationIds(ctx.clinic.id),
    getClinicUnitSummary(ctx.clinic.id),
  ]);

  return (
    <DashboardShell
      role="admin"
      userFullName={ctx.user.profile.fullName || ctx.user.email || "مسؤول"}
      userEmail={ctx.user.email}
      initialUnresolvedEscalationConversationIds={initialUnresolvedEscalationConversationIds}
      clinicId={ctx.clinic.id}
      clinicName={ctx.clinic.name}
      clinicLogoUrl={ctx.clinic.logoUrl}
      aiUnits={{
        balance: units.unitBalance,
        low: units.lowUnits,
        sufficient: units.unitsSufficient,
      }}
      viaPlatformAdmin={ctx.viaPlatformAdmin}
    >
      {children}
    </DashboardShell>
  );
}
