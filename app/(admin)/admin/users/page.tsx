import { createClient } from "@/lib/supabase/server";
import { listUsers } from "@/server/services/users";
import PageHeader from "@/components/admin/page-header";
import { RoleBadge } from "@/components/admin/status-badge";
import UserRowActions from "./_components/user-row-actions";

export default async function AdminUsersPage() {
  const supabase = await createClient();
  const {
    data: { user: me },
  } = await supabase.auth.getUser();

  const users = await listUsers();

  return (
    <div>
      <PageHeader
        title="المستخدمون"
        subtitle={`${users.length} مستخدم مسجّل`}
      />

      <div className="bg-card border border-border rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm font-sans">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                <th className="text-start px-4 py-3 font-medium text-muted-foreground">
                  الاسم
                </th>
                <th className="text-start px-4 py-3 font-medium text-muted-foreground">
                  البريد الإلكتروني
                </th>
                <th className="text-start px-4 py-3 font-medium text-muted-foreground">
                  الهاتف
                </th>
                <th className="text-start px-4 py-3 font-medium text-muted-foreground">
                  الدور
                </th>
                <th className="text-start px-4 py-3 font-medium text-muted-foreground">
                  تاريخ التسجيل
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {users.length === 0 && (
                <tr>
                  <td
                    colSpan={6}
                    className="text-center py-12 text-muted-foreground"
                  >
                    لا يوجد مستخدمون
                  </td>
                </tr>
              )}
              {users.map((user) => (
                <tr
                  key={user.id}
                  className="hover:bg-muted/30 transition-colors"
                >
                  <td className="px-4 py-3 font-medium text-foreground">
                    {user.fullName}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground" dir="ltr">
                    {user.email}
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
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
