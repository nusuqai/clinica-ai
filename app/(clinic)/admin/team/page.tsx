import { redirect } from "next/navigation";
import { Role } from "@prisma/client";
import { requireClinicMember, roleHome } from "@/lib/auth";
import { listRoles, listTeamMembers } from "@/server/services/team";
import { listBranches } from "@/server/services/branches";
import PageHeader from "@/components/admin/page-header";
import TeamManager from "./_components/team-manager";

// Team & roles — the clinic ADMIN only. There is no permission that opens this
// page, so staff can never change who may do what.
export default async function AdminTeamPage() {
  const ctx = await requireClinicMember();
  if (ctx.role !== Role.ADMIN) redirect(roleHome(ctx.role));

  const [members, roles, branches] = await Promise.all([
    listTeamMembers(ctx.clinic.id),
    listRoles(ctx.clinic.id),
    listBranches(ctx.clinic.id),
  ]);

  return (
    <div>
      <PageHeader
        title="فريق العمل"
        subtitle="أضف أعضاء الفريق وحدّد ما يستطيع كل دور إدارته في العيادة"
      />
      <TeamManager
        members={members.map((m) => ({ ...m, joinedAt: m.joinedAt.toISOString() }))}
        roles={roles}
        branches={branches.map((b) => ({ id: b.id, name: b.name }))}
        currentUserId={ctx.user.id}
      />
    </div>
  );
}
