"use client";

import { useDroppable } from "@dnd-kit/core";
import type { AppointmentStatus } from "@prisma/client";
import type { AdminAppointment } from "@/server/services/appointments";
import { InfiniteScroll } from "@/components/ui/infinite-scroll";
import AppointmentCard from "./appointment-card";

const COLUMN_ACCENTS: Record<AppointmentStatus, string> = {
  PENDING: "border-t-amber-400",
  CONFIRMED: "border-t-blue-400",
  COMPLETED: "border-t-emerald-400",
  CANCELLED: "border-t-red-400",
  NO_SHOW: "border-t-gray-400",
};

interface BoardColumnProps {
  status: AppointmentStatus;
  label: string;
  /** The cards loaded so far. */
  appointments: AdminAppointment[];
  /** All matching appointments in this status (server count). */
  total: number;
  hasMore: boolean;
  loading: boolean;
  error: boolean;
  onLoadMore: () => void;
  onOpenDetails: (appointment: AdminAppointment) => void;
}

export default function BoardColumn({
  status,
  label,
  appointments,
  total,
  hasMore,
  loading,
  error,
  onLoadMore,
  onOpenDetails,
}: BoardColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id: status });

  return (
    // Fixed height: each column scrolls its own cards, so a long column never
    // stretches the board or the others.
    <div className="flex h-[calc(100vh-20rem)] min-h-[280px] w-72 flex-shrink-0 flex-col">
      <div
        className={`flex items-center justify-between rounded-t-xl border-t-4 bg-muted/40 px-3 py-2 ${COLUMN_ACCENTS[status]}`}
      >
        <h3 className="font-heading text-sm font-bold text-foreground">{label}</h3>
        <span className="rounded-full border border-border bg-background px-2 py-0.5 font-sans text-xs font-medium text-muted-foreground">
          {total}
        </span>
      </div>

      <div
        ref={setNodeRef}
        className={[
          "flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto rounded-b-xl border border-t-0 border-border p-2 transition-colors",
          isOver ? "bg-primary/5" : "bg-muted/10",
        ].join(" ")}
      >
        {appointments.length === 0 && (
          <p className="py-6 text-center font-sans text-xs text-muted-foreground">لا توجد مواعيد</p>
        )}
        {appointments.map((appt) => (
          <AppointmentCard key={appt.id} appointment={appt} onOpenDetails={onOpenDetails} />
        ))}
        <InfiniteScroll
          onLoadMore={onLoadMore}
          hasMore={hasMore}
          loading={loading}
          error={error}
          className="py-1"
        />
      </div>
    </div>
  );
}
