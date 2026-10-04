import { requireClinicMember } from "@/lib/auth";
import PageHeader from "@/components/admin/page-header";
import { usersPageAction } from "@/server/actions/admin";
import UsersTable from "./_components/users-table";

interface PageProps {
  searchParams: Promise<{ q?: string }>;
}

export default async function AdminUsersPage({ searchParams }: PageProps) {
  await requireClinicMember(["ADMIN"]);
  const { q = "" } = await searchParams;
  const users = await usersPageAction(q, 1);

  return (
    <div>
      <PageHeader title="المستخدمون" subtitle={`${users.total} مستخدم مسجّل`} />
      <UsersTable initial={users} query={q} />
    </div>
  );
}
