import Link from "next/link";
import { Eye } from "lucide-react";
import { requirePermission } from "@/lib/auth";
import { listPatients } from "@/server/services/team";
import PageHeader from "@/components/admin/page-header";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

// The clinic's patients only. Team members (admins + staff) live on /admin/team
// and doctors on /admin/doctors.
export default async function AdminPatientsPage() {
  const { clinic } = await requirePermission("patients");
  const patients = await listPatients(clinic.id);

  return (
    <div>
      <PageHeader title="المرضى" subtitle={`${patients.length} مريض مسجّل`} />

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <Table className="w-full font-sans text-sm">
            <TableHeader>
              <TableRow className="border-b border-border bg-muted/40">
                <TableHead className="px-4 py-3 text-start font-medium text-muted-foreground">
                  الاسم
                </TableHead>
                <TableHead className="px-4 py-3 text-start font-medium text-muted-foreground">
                  الهاتف
                </TableHead>
                <TableHead className="px-4 py-3 text-start font-medium text-muted-foreground">
                  البريد الإلكتروني
                </TableHead>
                <TableHead className="px-4 py-3 text-start font-medium text-muted-foreground">
                  المواعيد
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
              {patients.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="py-12 text-center text-muted-foreground">
                    لا يوجد مرضى مسجّلون بعد
                  </TableCell>
                </TableRow>
              )}
              {patients.map((patient) => (
                <TableRow key={patient.id} className="transition-colors hover:bg-muted/30">
                  <TableCell className="px-4 py-3 font-medium">
                    <Link
                      href={`/admin/patients/${patient.id}`}
                      className="text-foreground transition-colors hover:text-primary"
                    >
                      {patient.fullName || "—"}
                    </Link>
                  </TableCell>
                  <TableCell className="px-4 py-3 text-muted-foreground" dir="ltr">
                    {patient.phone ?? "—"}
                  </TableCell>
                  <TableCell className="px-4 py-3 text-muted-foreground" dir="ltr">
                    {patient.email || "—"}
                  </TableCell>
                  <TableCell className="px-4 py-3 text-muted-foreground">
                    {patient.appointmentCount}
                  </TableCell>
                  <TableCell className="px-4 py-3 text-muted-foreground">
                    {new Date(patient.joinedAt).toLocaleDateString("ar-EG")}
                  </TableCell>
                  <TableCell className="px-4 py-3 text-end">
                    <Button
                      asChild
                      variant="outline"
                      className="h-auto gap-1.5 rounded-lg bg-transparent px-3 py-1.5 text-xs hover:bg-muted [&_svg]:size-3.5"
                    >
                      <Link href={`/admin/patients/${patient.id}`}>
                        <Eye className="h-3.5 w-3.5" />
                        عرض التفاصيل
                      </Link>
                    </Button>
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
