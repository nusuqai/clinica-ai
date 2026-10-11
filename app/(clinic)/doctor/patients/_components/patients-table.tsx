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
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

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
    <Card className="overflow-hidden">
      <div className="overflow-x-auto">
        <Table className="w-full font-sans text-sm">
          <TableHeader>
            <TableRow className="border-b border-border bg-muted/40">
              <TableHead className="px-4 py-3 text-start font-medium text-muted-foreground">
                المريض
              </TableHead>
              <TableHead className="px-4 py-3 text-start font-medium text-muted-foreground">
                رقم الهاتف
              </TableHead>
              <TableHead className="px-4 py-3 text-start font-medium text-muted-foreground">
                آخر موعد
              </TableHead>
              <TableHead className="px-4 py-3 text-start font-medium text-muted-foreground">
                حالة آخر موعد
              </TableHead>
              <TableHead className="px-4 py-3 text-start font-medium text-muted-foreground">
                إجمالي المواعيد
              </TableHead>
              <TableHead className="px-4 py-3 text-start font-medium text-muted-foreground">
                السجل العلاجي
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody className="divide-y divide-border">
            {items.map((patient) => {
              return (
                <TableRow key={patient.patientId} className="transition-colors hover:bg-muted/30">
                  <TableCell className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <Avatar className="h-9 w-9 rounded-xl">
                        <AvatarFallback className="rounded-xl bg-accent/10 text-sm font-bold text-accent">
                          {patient.fullName.charAt(0)}
                        </AvatarFallback>
                      </Avatar>
                      <p className="font-medium text-foreground">{patient.fullName}</p>
                    </div>
                  </TableCell>
                  <TableCell className="px-4 py-3 text-muted-foreground">
                    {patient.phone ? (
                      <span className="flex items-center gap-1.5" dir="ltr">
                        <Phone className="h-3.5 w-3.5 flex-shrink-0" />
                        {patient.phone}
                      </span>
                    ) : (
                      <span className="text-muted-foreground/50">—</span>
                    )}
                  </TableCell>
                  <TableCell className="px-4 py-3 text-muted-foreground">
                    <span className="flex items-center gap-1.5">
                      <Calendar className="h-3.5 w-3.5 flex-shrink-0" />
                      {patient.lastAppointmentDate
                        ? formatSlotDate(patient.lastAppointmentDate)
                        : "—"}
                    </span>
                  </TableCell>
                  <TableCell className="px-4 py-3">
                    <AppointmentStatusBadge status={patient.lastStatus} />
                  </TableCell>
                  <TableCell className="px-4 py-3">
                    <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-muted font-sans text-xs font-semibold text-muted-foreground">
                      {patient.totalAppointments}
                    </span>
                  </TableCell>
                  <TableCell className="px-4 py-3">
                    <Button
                      asChild
                      variant="outline"
                      className="h-auto gap-1.5 rounded-lg bg-transparent px-2.5 py-1.5 text-xs text-muted-foreground hover:border-foreground/30 hover:bg-transparent hover:text-foreground [&_svg]:size-3.5"
                    >
                      <Link href={`/doctor/patients/${patient.patientId}`}>
                        <FileText className="h-3.5 w-3.5" />
                        عرض السجل
                      </Link>
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
            <InfiniteScroll
              as="tr"
              onLoadMore={loadMore}
              hasMore={hasMore}
              loading={loading}
              error={error}
            />
          </TableBody>
        </Table>
      </div>
    </Card>
  );
}
