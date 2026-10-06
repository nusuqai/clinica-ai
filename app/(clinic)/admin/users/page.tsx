import Link from "next/link";
import { Eye } from "lucide-react";
import { requireClinicMember } from "@/lib/auth";
import { listUsers } from "@/server/services/users";
import { isSyntheticEmail } from "@/server/services/patients";
import PageHeader from "@/components/admin/page-header";
import { RoleBadge } from "@/components/admin/status-badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card } from "@/components/ui/card";

export default async function AdminUsersPage() {
  const { clinic } = await requireClinicMember(["ADMIN"]);
  const users = await listUsers(clinic.id);

  return (
    <div>
      <PageHeader title="المستخدمون" subtitle={`${users.length} مستخدم مسجّل`} />

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <Table className="w-full font-sans text-sm">
            <TableHeader>
              <TableRow className="border-b border-border bg-muted/40">
                <TableHead className="px-4 py-3 text-start font-medium text-muted-foreground">
                  الاسم
                </TableHead>
                <TableHead className="px-4 py-3 text-start font-medium text-muted-foreground">
                  البريد الإلكتروني
                </TableHead>
                <TableHead className="px-4 py-3 text-start font-medium text-muted-foreground">
                  الهاتف
                </TableHead>
                <TableHead className="px-4 py-3 text-start font-medium text-muted-foreground">
                  الدور
                </TableHead>
                <TableHead className="px-4 py-3 text-start font-medium text-muted-foreground">
                  تاريخ التسجيل
                </TableHead>
                <TableHead className="px-4 py-3 text-end font-medium text-muted-foreground">
                  الإجراءات
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody className="divide-y divide-border">
              {users.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="py-12 text-center text-muted-foreground">
                    لا يوجد مستخدمون
                  </TableCell>
                </TableRow>
              )}
              {users.map((user) => (
                <TableRow key={user.id} className="transition-colors hover:bg-muted/30">
                  <TableCell className="px-4 py-3 font-medium">
                    <Link
                      href={`/admin/users/${user.id}`}
                      className="text-foreground transition-colors hover:text-primary"
                    >
                      {user.fullName}
                    </Link>
                  </TableCell>
                  <TableCell className="px-4 py-3 text-muted-foreground" dir="ltr">
                    {isSyntheticEmail(user.email) ? "—" : user.email}
                  </TableCell>
                  <TableCell className="px-4 py-3 text-muted-foreground" dir="ltr">
                    {user.phone ?? "—"}
                  </TableCell>
                  <TableCell className="px-4 py-3">
                    <RoleBadge role={user.role} />
                  </TableCell>
                  <TableCell className="px-4 py-3 text-muted-foreground">
                    {new Date(user.createdAt).toLocaleDateString("ar-EG")}
                  </TableCell>
                  <TableCell className="px-4 py-3 text-end">
                    <Link
                      href={`/admin/users/${user.id}`}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 font-sans text-xs font-medium text-foreground transition-colors hover:bg-muted"
                    >
                      <Eye className="h-3.5 w-3.5" />
                      عرض التفاصيل
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Card>
    </div>
  );
}
