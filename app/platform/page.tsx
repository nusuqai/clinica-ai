import Link from "next/link";
import { ClinicRequestStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export default async function PlatformOverviewPage() {
  const [clinicCount, pendingRequests, doctorCount, memberCount, clinics] =
    await Promise.all([
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
      <h1 className="mb-6 font-heading text-2xl font-bold text-foreground">
        نظرة عامة على المنصة
      </h1>

      <div className="mb-8 grid grid-cols-2 gap-4 md:grid-cols-4">
        {stats.map((s) => (
          <div
            key={s.label}
            className="rounded-2xl border border-border bg-card p-5"
          >
            <p className="font-heading text-2xl font-bold text-foreground">
              {s.value}
            </p>
            <p className="text-sm text-muted-foreground">{s.label}</p>
          </div>
        ))}
      </div>

      <div className="overflow-hidden rounded-2xl border border-border bg-card">
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <h2 className="font-heading font-semibold text-foreground">العيادات</h2>
          <Link
            href="/platform/clinics"
            className="text-sm text-primary hover:underline"
          >
            إدارة العيادات
          </Link>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm font-sans">
            <thead>
              <tr className="border-b border-border bg-muted/40 text-muted-foreground">
                <th className="px-4 py-3 text-start font-medium">العيادة</th>
                <th className="px-4 py-3 text-start font-medium">المعرّف</th>
                <th className="px-4 py-3 text-start font-medium">الأعضاء</th>
                <th className="px-4 py-3 text-start font-medium">الأطباء</th>
                <th className="px-4 py-3 text-start font-medium">المواعيد</th>
                <th className="px-4 py-3 text-start font-medium">الحالة</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {clinics.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-10 text-center text-muted-foreground">
                    لا توجد عيادات بعد
                  </td>
                </tr>
              )}
              {clinics.map((c) => (
                <tr key={c.id} className="hover:bg-muted/30">
                  <td className="px-4 py-3 font-medium text-foreground">{c.name}</td>
                  <td className="px-4 py-3 text-muted-foreground" dir="ltr">
                    /clinic/{c.slug}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{c._count.members}</td>
                  <td className="px-4 py-3 text-muted-foreground">{c._count.doctors}</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {c._count.appointments}
                  </td>
                  <td className="px-4 py-3">
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
