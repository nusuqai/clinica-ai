"use client";

import Link from "next/link";
import { Phone, Calendar, FileText } from "lucide-react";
import type { DoctorPatient } from "@/server/services/doctors";
import type { Paginated } from "@/lib/pagination";
import { myPatientsPageAction } from "@/server/actions/doctor";
import { useLoadMore } from "@/hooks/use-load-more";
import { InfiniteScroll } from "@/components/ui/infinite-scroll";
import { AppointmentStatusBadge } from "@/components/admin/status-badge";
import { formatSlotDate } from "@/lib/slot-time";

// The doctor's patients: first page from the server, the rest on scroll.
export default function PatientsTable({
  initial,
  query,
}: {
  initial: Paginated<DoctorPatient & { id: string }>;
  /** The search `initial` was rendered with — later pages use the same. */
  query: string;
}) {
  const { items, hasMore, loading, error, loadMore } = useLoadMore(initial, (page) =>
    myPatientsPageAction(query, page)
  );

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card">
      <div className="overflow-x-auto">
        <table className="w-full font-sans text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/40">
              <th className="px-4 py-3 text-start font-medium text-muted-foreground">المريض</th>
              <th className="px-4 py-3 text-start font-medium text-muted-foreground">رقم الهاتف</th>
              <th className="px-4 py-3 text-start font-medium text-muted-foreground">آخر موعد</th>
              <th className="px-4 py-3 text-start font-medium text-muted-foreground">
                حالة آخر موعد
              </th>
              <th className="px-4 py-3 text-start font-medium text-muted-foreground">
                إجمالي المواعيد
              </th>
              <th className="px-4 py-3 text-start font-medium text-muted-foreground">
                السجل العلاجي
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {items.map((patient) => {
              return (
                <tr key={patient.patientId} className="transition-colors hover:bg-muted/30">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-accent/10">
                        <span className="text-sm font-bold text-accent">
                          {patient.fullName.charAt(0)}
                        </span>
                      </div>
                      <p className="font-medium text-foreground">{patient.fullName}</p>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {patient.phone ? (
                      <span className="flex items-center gap-1.5" dir="ltr">
                        <Phone className="h-3.5 w-3.5 flex-shrink-0" />
                        {patient.phone}
                      </span>
                    ) : (
                      <span className="text-muted-foreground/50">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    <span className="flex items-center gap-1.5">
                      <Calendar className="h-3.5 w-3.5 flex-shrink-0" />
                      {patient.lastAppointmentDate
                        ? formatSlotDate(patient.lastAppointmentDate)
                        : "—"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <AppointmentStatusBadge status={patient.lastStatus} />
                  </td>
                  <td className="px-4 py-3">
                    <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-muted font-sans text-xs font-semibold text-muted-foreground">
                      {patient.totalAppointments}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <Link
                      href={`/doctor/patients/${patient.patientId}`}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 font-sans text-xs font-medium text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground"
                    >
                      <FileText className="h-3.5 w-3.5" />
                      عرض السجل
                    </Link>
                  </td>
                </tr>
              );
            })}
            <InfiniteScroll
              as="tr"
              onLoadMore={loadMore}
              hasMore={hasMore}
              loading={loading}
              error={error}
            />
          </tbody>
        </table>
      </div>
    </div>
  );
}
