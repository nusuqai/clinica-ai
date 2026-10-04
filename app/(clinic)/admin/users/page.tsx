import { Role } from "@prisma/client";
import { requireClinicMember } from "@/lib/auth";
import PageHeader from "@/components/admin/page-header";
import { FilterBar } from "@/components/ui/filter-bar";
import { ROLE_LABELS } from "@/lib/labels";
import { usersPageAction } from "@/server/actions/admin";
import UsersTable from "./_components/users-table";

interface PageProps {
  searchParams: Promise<{ q?: string; role?: string }>;
}

export default async function AdminUsersPage({ searchParams }: PageProps) {
  await requireClinicMember(["ADMIN"]);
  const { q, role } = await searchParams;
  const filters = { query: q, role };
  const users = await usersPageAction(filters, 1);

  return (
    <div>
      <PageHeader title="المستخدمون" subtitle={`${users.total} مستخدم مسجّل`} />
      <FilterBar
        fields={[
          { type: "search", param: "q", placeholder: "بحث بالاسم أو رقم الهاتف..." },
          {
            type: "select",
            param: "role",
            allLabel: "كل الأدوار",
            options: Object.values(Role).map((r) => ({ value: r, label: ROLE_LABELS[r] })),
          },
        ]}
      />
      <UsersTable initial={users} filters={filters} />
    </div>
  );
}
