"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import type { AppointmentStatus } from "@prisma/client";
import type { DoctorAppointmentView } from "@/server/services/appointments";
import type { Paginated } from "@/lib/pagination";
import { myAppointmentsPageAction } from "@/server/actions/doctor";
import { useLoadMore } from "@/hooks/use-load-more";
import { InfiniteScroll } from "@/components/ui/infinite-scroll";
import { AppointmentStatusBadge } from "@/components/admin/status-badge";
import RecordFormModal from "@/components/medical/record-form-modal";
import { formatSlotDate, formatSlotTime } from "@/lib/slot-time";
import AppointmentActions from "./appointment-actions";
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
import { Hint } from "@/components/ui/tooltip";

type Row = DoctorAppointmentView & { hasRecord: boolean };

// The doctor's appointments table: first page from the server, the rest
// loaded as the doctor scrolls (same filters).
export default function AppointmentsTable({
  initial,
  filters,
}: {
  initial: Paginated<Row>;
  /** The filters `initial` was rendered with — later pages use the same. */
  filters: { status?: AppointmentStatus; patientQuery?: string; date?: string };
}) {
  const { items, hasMore, loading, error, loadMore } = useLoadMore(initial, (page) =>
    myAppointmentsPageAction(filters, page)
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
                التاريخ
              </TableHead>
              <TableHead className="px-4 py-3 text-start font-medium text-muted-foreground">
                الوقت
              </TableHead>
              <TableHead className="px-4 py-3 text-start font-medium text-muted-foreground">
                الحالة
              </TableHead>
              <TableHead className="px-4 py-3 text-start font-medium text-muted-foreground">
                ملاحظات المريض
              </TableHead>
              <TableHead className="px-4 py-3 text-start font-medium text-muted-foreground">
                الإجراءات
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody className="divide-y divide-border">
            {items.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="py-16 text-center text-muted-foreground">
                  لا توجد مواعيد
                </TableCell>
              </TableRow>
            )}
            {items.map((appt) => {
              return (
                <TableRow key={appt.id} className="align-top transition-colors hover:bg-muted/30">
                  <TableCell className="px-4 py-3">
                    <div className="flex items-center gap-2.5">
                      <Avatar className="h-8 w-8 rounded-lg">
                        <AvatarFallback className="rounded-lg bg-primary/10 text-xs font-bold text-primary">
                          {appt.patient.fullName.charAt(0)}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="font-medium text-foreground">{appt.patient.fullName}</p>
                        {appt.patient.phone && (
                          <p className="text-xs text-muted-foreground" dir="ltr">
                            {appt.patient.phone}
                          </p>
                        )}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="px-4 py-3 text-muted-foreground">
                    {appt.slot
                      ? formatSlotDate(appt.slot.date)
                      : appt.bookingDate
                        ? formatSlotDate(appt.bookingDate)
                        : "—"}
                  </TableCell>
                  <TableCell className="px-4 py-3 text-muted-foreground" dir="ltr">
                    {appt.slot ? (
                      <>
                        {formatSlotTime(appt.slot.startTime)}
                        {" – "}
                        {formatSlotTime(appt.slot.endTime)}
                      </>
                    ) : appt.orderNumber != null ? (
                      <span dir="rtl">دور رقم {appt.orderNumber}</span>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell className="px-4 py-3">
                    <AppointmentStatusBadge status={appt.status} />
                    {appt.cancellationReason && (
                      <Hint label={appt.cancellationReason}>
                        <p className="mt-1 max-w-[120px] truncate text-xs text-muted-foreground">
                          {appt.cancellationReason}
                        </p>
                      </Hint>
                    )}
                  </TableCell>
                  <TableCell className="max-w-[160px] px-4 py-3 text-muted-foreground">
                    <Hint label={appt.patientNotes ?? ""}>
                      <p className="truncate text-xs">{appt.patientNotes || "—"}</p>
                    </Hint>
                    {appt.doctorNotes && (
                      <Hint label={appt.doctorNotes}>
                        <p className="mt-0.5 truncate text-xs text-primary">
                          ✍ {appt.doctorNotes}
                        </p>
                      </Hint>
                    )}
                  </TableCell>
                  <TableCell className="px-4 py-3">
                    <div className="space-y-1.5">
                      <AppointmentActions
                        appointmentId={appt.id}
                        currentStatus={appt.status}
                        currentNotes={appt.doctorNotes}
                      />
                      <RecordFormModal
                        appointmentId={appt.id}
                        patientName={appt.patient.fullName}
                        defaultVisitDate={appt.slot?.date ?? appt.bookingDate}
                        hasRecord={appt.hasRecord}
                      />
                      <Button
                        asChild
                        variant="outline"
                        className="h-auto gap-1 rounded-lg bg-transparent px-2.5 py-1.5 text-xs text-muted-foreground hover:border-foreground/30 hover:bg-transparent hover:text-foreground [&_svg]:size-3.5"
                      >
                        <Link href={`/doctor/appointments/${appt.id}`}>
                          <ArrowLeft className="h-3.5 w-3.5" />
                          التفاصيل
                        </Link>
                      </Button>
                    </div>
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
