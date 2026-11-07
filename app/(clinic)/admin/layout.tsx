import { redirect } from "next/navigation";
import { Role } from "@prisma/client";
import { can, requireClinicMember, roleHome } from "@/lib/auth";
import { isDashboardRole } from "@/lib/permissions";
import DashboardShell from "@/components/general/dashboard-shell";
import { getUnresolvedEscalationConversationIds } from "@/server/services/messages";
import { getClinicUnitSummary } from "@/server/services/aiCredit";

// The admin dashboard is shared by the clinic ADMIN and its STAFF. The layout
// only lets them in and trims the shell; each page guards its own permission
// (requirePermission), and team management is ADMIN-only.
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireClinicMember();
  if (!isDashboardRole(ctx.role)) redirect(roleHome(ctx.role));

  const isClinicAdmin = ctx.role === Role.ADMIN;
  // Only fetch what this member is allowed to see in the shell.
  const [initialUnresolvedEscalationConversationIds, units] = await Promise.all([
    can(ctx, "messages") ? getUnresolvedEscalationConversationIds(ctx.clinic.id) : [],
    can(ctx, "agent") ? getClinicUnitSummary(ctx.clinic.id) : null,
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
      aiUnits={
        units
          ? {
              balance: units.unitBalance,
              low: units.lowUnits,
              sufficient: units.unitsSufficient,
            }
          : null
      }
      viaPlatformAdmin={ctx.viaPlatformAdmin}
      isClinicAdmin={isClinicAdmin}
      permissions={ctx.permissions}
      roleLabel={isClinicAdmin ? null : (ctx.roleName ?? "موظف")}
    >
      {children}
    </DashboardShell>
  );
}
