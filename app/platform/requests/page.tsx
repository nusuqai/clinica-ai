import { ClinicRequestStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { CLINIC_REQUEST_STATUS_LABELS } from "@/lib/labels";
import RequestActions from "./_components/request-actions";
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

export default async function PlatformRequestsPage() {
  const requests = await prisma.clinicRequest.findMany({
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    include: { createdClinic: { select: { slug: true } } },
  });

  return (
    <div>
      <h1 className="mb-6 font-heading text-2xl font-bold text-foreground">طلبات إنشاء العيادات</h1>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <Table className="w-full font-sans text-sm">
            <TableHeader>
              <TableRow className="border-b border-border bg-muted/40 text-muted-foreground">
                <TableHead className="px-4 py-3 text-start font-medium">مقدّم الطلب</TableHead>
                <TableHead className="px-4 py-3 text-start font-medium">العيادة المطلوبة</TableHead>
                <TableHead className="px-4 py-3 text-start font-medium">التواصل</TableHead>
                <TableHead className="px-4 py-3 text-start font-medium">الحالة</TableHead>
                <TableHead className="px-4 py-3 text-start font-medium">إجراءات</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody className="divide-y divide-border">
              {requests.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
                    لا توجد طلبات
                  </TableCell>
                </TableRow>
              )}
              {requests.map((r) => (
                <TableRow key={r.id} className="align-top hover:bg-muted/30">
                  <TableCell className="px-4 py-3 font-medium text-foreground">
                    {r.requesterName}
                    {r.note && <p className="mt-1 text-xs text-muted-foreground">{r.note}</p>}
                  </TableCell>
                  <TableCell className="px-4 py-3 text-foreground">
                    {r.requestedClinicName}
                    {r.createdClinic && (
                      <a
                        href={clinicOrigin(r.createdClinic.slug)}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-1 block text-xs text-muted-foreground hover:text-primary hover:underline"
                        dir="ltr"
                      >
                        {clinicHost(r.createdClinic.slug)}
                      </a>
                    )}
                  </TableCell>
                  <TableCell className="px-4 py-3 text-muted-foreground" dir="ltr">
                    <div>{r.requesterEmail}</div>
                    {r.requesterPhone && <div>{r.requesterPhone}</div>}
                  </TableCell>
                  <TableCell className="px-4 py-3">
                    <span className="inline-flex rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-foreground">
                      {CLINIC_REQUEST_STATUS_LABELS[r.status]}
                    </span>
                  </TableCell>
                  <TableCell className="px-4 py-3">
                    {r.status === ClinicRequestStatus.PENDING ? (
                      <RequestActions requestId={r.id} />
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
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
