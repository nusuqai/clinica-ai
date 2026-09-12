import Link from "next/link";
import { Eye } from "lucide-react";
import { requireActiveMember } from "@/lib/auth";
import { listUsers } from "@/server/services/users";
import { isSyntheticEmail } from "@/server/services/patients";
import PageHeader from "@/components/admin/page-header";
import { RoleBadge } from "@/components/admin/status-badge";

export default async function AdminUsersPage() {
  const { clinic } = await requireActiveMember(["ADMIN"]);
  const users = await listUsers(clinic.id);

  return (
    <div>
      <PageHeader title="المستخدمون" subtitle={`${users.length} مستخدم مسجّل`} />

      <div className="overflow-hidden rounded-2xl border border-border bg-card">
        <div className="overflow-x-auto">
          <table className="w-full font-sans text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                <th className="px-4 py-3 text-start font-medium text-muted-foreground">الاسم</th>
                <th className="px-4 py-3 text-start font-medium text-muted-foreground">
                  البريد الإلكتروني
                </th>
                <th className="px-4 py-3 text-start font-medium text-muted-foreground">الهاتف</th>
                <th className="px-4 py-3 text-start font-medium text-muted-foreground">الدور</th>
                <th className="px-4 py-3 text-start font-medium text-muted-foreground">
                  تاريخ التسجيل
                </th>
                <th className="px-4 py-3 text-end font-medium text-muted-foreground">الإجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {users.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-muted-foreground">
                    لا يوجد مستخدمون
                  </td>
                </tr>
              )}
              {users.map((user) => (
                <tr key={user.id} className="transition-colors hover:bg-muted/30">
                  <td className="px-4 py-3 font-medium">
                    <Link
                      href={`/admin/users/${user.id}`}
                      className="text-foreground transition-colors hover:text-primary"
                    >
                      {user.fullName}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground" dir="ltr">
                    {isSyntheticEmail(user.email) ? "—" : user.email}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground" dir="ltr">
                    {user.phone ?? "—"}
                  </td>
                  <td className="px-4 py-3">
                    <RoleBadge role={user.role} />
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {new Date(user.createdAt).toLocaleDateString("ar-EG")}
                  </td>
                  <td className="px-4 py-3 text-end">
                    <Link
                      href={`/admin/users/${user.id}`}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 font-sans text-xs font-medium text-foreground transition-colors hover:bg-muted"
                    >
                      <Eye className="h-3.5 w-3.5" />
                      عرض التفاصيل
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
