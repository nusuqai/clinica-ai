import Link from "next/link";
import { ClinicRequestStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { clinicHost, clinicOrigin } from "@/lib/clinic-url";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card } from "@/components/ui/card";

export default async function PlatformOverviewPage() {
  const [clinicCount, pendingRequests, doctorCount, memberCount, clinics] = await Promise.all([
    prisma.clinic.count(),
    prisma.clinicRequest.count({ where: { status: ClinicRequestStatus.PENDING } }),
    prisma.doctor.count(),
    prisma.clinicMember.count(),
    prisma.clinic.findMany({
      orderBy: { createdAt: "desc" },
      take: 20,
      select: {
        id: true,
        name: true,
        slug: true,
        isActive: true,
        _count: { select: { members: true, doctors: true, appointments: true } },
      },
    }),
  ]);

  const stats = [
    { label: "العيادات", value: clinicCount },
    { label: "طلبات قيد الانتظار", value: pendingRequests },
    { label: "الأطباء (كل العيادات)", value: doctorCount },
    { label: "الأعضاء (كل العيادات)", value: memberCount },
  ];

  return (
    <div>
      <h1 className="mb-6 font-heading text-2xl font-bold text-foreground">نظرة عامة على المنصة</h1>

      <div className="mb-8 grid grid-cols-2 gap-4 md:grid-cols-4">
        {stats.map((s) => (
          <Card key={s.label} className="p-5">
            <p className="font-heading text-2xl font-bold text-foreground">{s.value}</p>
            <p className="text-sm text-muted-foreground">{s.label}</p>
          </Card>
        ))}
      </div>

      <Card className="overflow-hidden">
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <h2 className="font-heading font-semibold text-foreground">العيادات</h2>
          <Link href="/platform/clinics" className="text-sm text-primary hover:underline">
            إدارة العيادات
          </Link>
        </div>
        <div className="overflow-x-auto">
          <Table className="w-full font-sans text-sm">
            <TableHeader>
              <TableRow className="border-b border-border bg-muted/40 text-muted-foreground">
                <TableHead className="px-4 py-3 text-start font-medium">العيادة</TableHead>
                <TableHead className="px-4 py-3 text-start font-medium">المعرّف</TableHead>
                <TableHead className="px-4 py-3 text-start font-medium">الأعضاء</TableHead>
                <TableHead className="px-4 py-3 text-start font-medium">الأطباء</TableHead>
                <TableHead className="px-4 py-3 text-start font-medium">المواعيد</TableHead>
                <TableHead className="px-4 py-3 text-start font-medium">الحالة</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody className="divide-y divide-border">
              {clinics.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                    لا توجد عيادات بعد
                  </TableCell>
                </TableRow>
              )}
              {clinics.map((c) => (
                <TableRow key={c.id} className="hover:bg-muted/30">
                  <TableCell className="px-4 py-3 font-medium text-foreground">{c.name}</TableCell>
                  <TableCell className="px-4 py-3 text-muted-foreground" dir="ltr">
                    <a
                      href={clinicOrigin(c.slug)}
                      target="_blank"
                      rel="noreferrer"
                      className="hover:text-primary hover:underline"
                    >
                      {clinicHost(c.slug)}
                    </a>
                  </TableCell>
                  <TableCell className="px-4 py-3 text-muted-foreground">
                    {c._count.members}
                  </TableCell>
                  <TableCell className="px-4 py-3 text-muted-foreground">
                    {c._count.doctors}
                  </TableCell>
                  <TableCell className="px-4 py-3 text-muted-foreground">
                    {c._count.appointments}
                  </TableCell>
                  <TableCell className="px-4 py-3">
                    <span
                      className={[
                        "inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium",
                        c.isActive
                          ? "bg-emerald-100 text-emerald-700"
                          : "bg-gray-100 text-gray-500",
                      ].join(" ")}
                    >
                      {c.isActive ? "نشطة" : "معطّلة"}
                    </span>
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
