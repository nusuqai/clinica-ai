import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { requireClinicMember } from "@/lib/auth";
import { listDoctors } from "@/server/services/doctors";
import { listBranches } from "@/server/services/branches";
import { listSpecialtyOptions } from "@/server/services/specialties";
import PageHeader from "@/components/admin/page-header";
import AddDoctorModal from "./_components/add-doctor-modal";
import EditDoctorModal from "./_components/edit-doctor-modal";
import DoctorRowActions from "./_components/doctor-row-actions";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Hint } from "@/components/ui/tooltip";

export default async function AdminDoctorsPage() {
  const { clinic } = await requireClinicMember(["ADMIN"]);
  const [doctors, branchRows, specialties] = await Promise.all([
    listDoctors(clinic.id),
    listBranches(clinic.id, { activeOnly: true }),
    listSpecialtyOptions(clinic.id),
  ]);
  const branches = branchRows.map((b) => ({
    id: b.id,
    name: b.name,
    hours: b.hours.map((h) => ({
      dayOfWeek: h.dayOfWeek,
      isClosed: h.isClosed,
      openTime: h.openTime,
      closeTime: h.closeTime,
    })),
  }));

  return (
    <div>
      <PageHeader
        title="الأطباء"
        subtitle={`${doctors.length} طبيب مسجّل`}
        action={<AddDoctorModal branches={branches} specialties={specialties} />}
      />

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <Table className="w-full font-sans text-sm">
            <TableHeader>
              <TableRow className="border-b border-border bg-muted/40">
                <TableHead className="px-4 py-3 text-start font-medium text-muted-foreground">
                  الاسم
                </TableHead>
                <TableHead className="px-4 py-3 text-start font-medium text-muted-foreground">
                  التخصص
                </TableHead>
                <TableHead className="px-4 py-3 text-start font-medium text-muted-foreground">
                  المواعيد
                </TableHead>
                <TableHead className="px-4 py-3 text-start font-medium text-muted-foreground">
                  الحالة
                </TableHead>
                <TableHead className="px-4 py-3 text-start font-medium text-muted-foreground">
                  إجراءات
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody className="divide-y divide-border">
              {doctors.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="py-12 text-center text-muted-foreground">
                    لا يوجد أطباء. أضف طبيباً جديداً لتبدأ.
                  </TableCell>
                </TableRow>
              )}
              {doctors.map((doctor) => (
                <TableRow key={doctor.id} className="transition-colors hover:bg-muted/30">
                  <TableCell className="px-4 py-3 font-medium text-foreground">
                    {doctor.profile.fullName}
                  </TableCell>
                  <TableCell className="px-4 py-3 text-muted-foreground">
                    {doctor.specialty}
                  </TableCell>
                  <TableCell className="px-4 py-3 text-muted-foreground">
                    {doctor._count.appointments}
                  </TableCell>
                  <TableCell className="px-4 py-3">
                    <Badge variant={doctor.isActive ? "success" : "neutral"}>
                      {doctor.isActive ? "نشط" : "غير نشط"}
                    </Badge>
                  </TableCell>
                  <TableCell className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      <Hint label="عرض التفاصيل">
                        <Link
                          aria-label="عرض التفاصيل"
                          href={`/admin/doctors/${doctor.id}`}
                          className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary"
                        >
                          <ExternalLink className="h-4 w-4" />
                        </Link>
                      </Hint>
                      <EditDoctorModal
                        doctor={doctor}
                        branches={branches}
                        specialties={specialties}
                      />
                      <DoctorRowActions doctorId={doctor.id} isActive={doctor.isActive} />
                    </div>
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
