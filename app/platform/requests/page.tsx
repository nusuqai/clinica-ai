import { ClinicRequestStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { CLINIC_REQUEST_STATUS_LABELS } from "@/lib/labels";
import RequestActions from "./_components/request-actions";

export default async function PlatformRequestsPage() {
  const requests = await prisma.clinicRequest.findMany({
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    include: { createdClinic: { select: { slug: true } } },
  });

  return (
    <div>
      <h1 className="mb-6 font-heading text-2xl font-bold text-foreground">
        طلبات إنشاء العيادات
      </h1>

      <div className="overflow-hidden rounded-2xl border border-border bg-card">
        <div className="overflow-x-auto">
          <table className="w-full text-sm font-sans">
            <thead>
              <tr className="border-b border-border bg-muted/40 text-muted-foreground">
                <th className="px-4 py-3 text-start font-medium">مقدّم الطلب</th>
                <th className="px-4 py-3 text-start font-medium">العيادة المطلوبة</th>
                <th className="px-4 py-3 text-start font-medium">التواصل</th>
                <th className="px-4 py-3 text-start font-medium">الحالة</th>
                <th className="px-4 py-3 text-start font-medium">إجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {requests.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-10 text-center text-muted-foreground">
                    لا توجد طلبات
                  </td>
                </tr>
              )}
              {requests.map((r) => (
                <tr key={r.id} className="align-top hover:bg-muted/30">
                  <td className="px-4 py-3 font-medium text-foreground">
                    {r.requesterName}
                    {r.note && (
                      <p className="mt-1 text-xs text-muted-foreground">{r.note}</p>
                    )}
                  </td>
                  <td className="px-4 py-3 text-foreground">
                    {r.requestedClinicName}
                    {r.createdClinic && (
                      <p className="mt-1 text-xs text-muted-foreground" dir="ltr">
                        /clinic/{r.createdClinic.slug}
                      </p>
                    )}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground" dir="ltr">
                    <div>{r.requesterEmail}</div>
                    {r.requesterPhone && <div>{r.requesterPhone}</div>}
                  </td>
                  <td className="px-4 py-3">
                    <span className="inline-flex rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-foreground">
                      {CLINIC_REQUEST_STATUS_LABELS[r.status]}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {r.status === ClinicRequestStatus.PENDING ? (
                      <RequestActions requestId={r.id} />
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
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
