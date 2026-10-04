"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import {
  DndContext,
  DragOverlay,
  type DragEndEvent,
  type DragStartEvent,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  Search,
  X,
  Calendar,
  Clock,
  Stethoscope,
  MapPin,
  Phone,
  User,
  StickyNote,
} from "lucide-react";
import { toast } from "sonner";
import Link from "next/link";
import { AppointmentStatus } from "@prisma/client";
import { appointmentsAfterAction, updateAppointmentStatusAction } from "@/server/actions/admin";
import type { AdminAppointment } from "@/server/services/appointments";
import { upsertById, type Paginated } from "@/lib/pagination";
import { useQueryParam } from "@/hooks/use-query-param";
import { canTransition } from "@/lib/appointment-transitions";
import { APPOINTMENT_STATUS_LABELS } from "@/lib/labels";
import { formatSlotDate, formatSlotTime } from "@/lib/slot-time";
import { AppointmentStatusBadge } from "@/components/admin/status-badge";
import Modal from "@/components/admin/modal";
import BoardColumn from "./board-column";
import { AppointmentCardOverlay } from "./appointment-card";

interface DoctorOption {
  id: string;
  fullName: string;
  specialty: string;
}

const STATUS_ORDER: AppointmentStatus[] = [
  AppointmentStatus.PENDING,
  AppointmentStatus.CONFIRMED,
  AppointmentStatus.COMPLETED,
  AppointmentStatus.CANCELLED,
  AppointmentStatus.NO_SHOW,
];

type ByStatus<T> = Record<AppointmentStatus, T>;

function byStatus<T>(fn: (status: AppointmentStatus) => T): ByStatus<T> {
  return Object.fromEntries(STATUS_ORDER.map((s) => [s, fn(s)])) as ByStatus<T>;
}

export interface BoardFilters {
  doctorId?: string;
  patientQuery?: string;
  date?: string;
}

interface AppointmentBoardProps {
  /** First page of each column, already filtered on the server. */
  columns: ByStatus<Paginated<AdminAppointment>>;
  /** The filters those pages were rendered with (they live in the URL). */
  filters: BoardFilters;
  doctors: DoctorOption[];
}

export default function AppointmentBoard({
  columns: initialColumns,
  filters,
  doctors,
}: AppointmentBoardProps) {
  // Every loaded card, across columns; a card's column is its status.
  const [appointments, setAppointments] = useState(() =>
    STATUS_ORDER.flatMap((s) => initialColumns[s].items)
  );
  const [totals, setTotals] = useState(() => byStatus((s) => initialColumns[s].total));
  const [hasMore, setHasMore] = useState(() => byStatus((s) => initialColumns[s].hasMore));
  const [loading, setLoading] = useState(() => byStatus(() => false));
  const [loadError, setLoadError] = useState(() => byStatus(() => false));
  // Adopt fresh server data (new filters, or a booking made from the header).
  useEffect(() => {
    setAppointments(STATUS_ORDER.flatMap((s) => initialColumns[s].items));
    setTotals(byStatus((s) => initialColumns[s].total));
    setHasMore(byStatus((s) => initialColumns[s].hasMore));
    setLoadError(byStatus(() => false));
  }, [initialColumns]);
  const [pendingCancelId, setPendingCancelId] = useState<string | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [detailsAppt, setDetailsAppt] = useState<AdminAppointment | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  // Filters live in the URL so the server renders the matching first pages.
  const [doctorFilter, setDoctorFilter] = useQueryParam("doctor");
  const [patientQuery, setPatientQuery] = useQueryParam("q", 300);
  const [dateFilter, setDateFilter] = useQueryParam("date");

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const hasActiveFilters = doctorFilter !== "" || patientQuery.trim() !== "" || dateFilter !== "";

  function clearFilters() {
    setDoctorFilter("");
    setPatientQuery("");
    setDateFilter("");
  }

  const columns = useMemo(() => {
    const grouped = byStatus<AdminAppointment[]>(() => []);
    for (const appt of appointments) grouped[appt.status].push(appt);
    return grouped;
  }, [appointments]);

  // Next cards of one column: the rows after the ones it shows now. An offset
  // (not a page number) stays right while cards are dragged in and out.
  async function loadMore(status: AppointmentStatus) {
    if (loading[status] || !hasMore[status]) return;
    setLoading((m) => ({ ...m, [status]: true }));
    setLoadError((m) => ({ ...m, [status]: false }));
    try {
      const next = await appointmentsAfterAction({ ...filters, status }, columns[status].length);
      setAppointments((prev) => upsertById(prev, next.items));
      setTotals((m) => ({ ...m, [status]: next.total }));
      setHasMore((m) => ({ ...m, [status]: next.hasMore }));
    } catch {
      setLoadError((m) => ({ ...m, [status]: true }));
    } finally {
      setLoading((m) => ({ ...m, [status]: false }));
    }
  }

  function applyStatus(
    id: string,
    from: AppointmentStatus,
    status: AppointmentStatus,
    cancellationReason?: string
  ) {
    // Column counts are server totals; keep them in step with the move.
    setTotals((m) => ({ ...m, [from]: m[from] - 1, [status]: m[status] + 1 }));
    setAppointments((prev) =>
      prev.map((a) =>
        a.id === id
          ? {
              ...a,
              status,
              cancellationReason:
                status === AppointmentStatus.CANCELLED
                  ? (cancellationReason ?? null)
                  : a.cancellationReason,
            }
          : a
      )
    );
  }

  function commitStatus(
    id: string,
    previousStatus: AppointmentStatus,
    status: AppointmentStatus,
    reason?: string
  ) {
    startTransition(async () => {
      const res = await updateAppointmentStatusAction(id, status, reason);
      if (res?.error) {
        // Revert the optimistic move and surface the validation error.
        applyStatus(id, status, previousStatus);
        toast.error(res.error);
      }
    });
  }

  function handleDragStart(event: DragStartEvent) {
    setDraggingId(String(event.active.id));
  }

  function handleDragEnd(event: DragEndEvent) {
    setDraggingId(null);
    const { active, over } = event;
    if (!over) return;

    const appointment = appointments.find((a) => a.id === active.id);
    if (!appointment) return;

    const newStatus = over.id as AppointmentStatus;
    if (newStatus === appointment.status) return;
    if (!canTransition(appointment.status, newStatus)) {
      toast.error(
        `لا يمكن نقل الموعد من "${APPOINTMENT_STATUS_LABELS[appointment.status]}" إلى "${APPOINTMENT_STATUS_LABELS[newStatus]}".`
      );
      return;
    }

    if (newStatus === AppointmentStatus.CANCELLED) {
      setPendingCancelId(appointment.id);
      setCancelReason("");
      return;
    }

    const previousStatus = appointment.status;
    applyStatus(appointment.id, previousStatus, newStatus);
    commitStatus(appointment.id, previousStatus, newStatus);
  }

  function confirmCancel() {
    if (!pendingCancelId || !cancelReason.trim()) return;
    const appointment = appointments.find((a) => a.id === pendingCancelId);
    if (!appointment) return;

    const previousStatus = appointment.status;
    applyStatus(appointment.id, previousStatus, AppointmentStatus.CANCELLED, cancelReason.trim());
    commitStatus(appointment.id, previousStatus, AppointmentStatus.CANCELLED, cancelReason.trim());
    setPendingCancelId(null);
    setCancelReason("");
  }

  const draggingCard = draggingId ? appointments.find((a) => a.id === draggingId) : null;

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={patientQuery}
            onChange={(e) => setPatientQuery(e.target.value)}
            placeholder="بحث باسم المريض..."
            className="w-56 rounded-xl border border-border bg-background py-2 pl-3 pr-9 font-sans text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </div>

        <select
          value={doctorFilter}
          onChange={(e) => setDoctorFilter(e.target.value)}
          className="rounded-xl border border-border bg-background px-3 py-2 font-sans text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
        >
          <option value="">كل الأطباء</option>
          {doctors.map((doc) => (
            <option key={doc.id} value={doc.id}>
              {doc.fullName} · {doc.specialty}
            </option>
          ))}
        </select>

        <input
          type="date"
          value={dateFilter}
          onChange={(e) => setDateFilter(e.target.value)}
          className="rounded-xl border border-border bg-background px-3 py-2 font-sans text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
        />

        {hasActiveFilters && (
          <button
            type="button"
            onClick={clearFilters}
            className="inline-flex items-center gap-1 px-3 py-2 font-sans text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <X className="h-4 w-4" />
            مسح الفلاتر
          </button>
        )}
      </div>

      <DndContext
        sensors={sensors}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragCancel={() => setDraggingId(null)}
      >
        <div className="flex gap-4 overflow-x-auto pb-4">
          {STATUS_ORDER.map((status) => (
            <BoardColumn
              key={status}
              status={status}
              label={APPOINTMENT_STATUS_LABELS[status]}
              appointments={columns[status]}
              total={totals[status]}
              hasMore={hasMore[status]}
              loading={loading[status]}
              error={loadError[status]}
              onLoadMore={() => loadMore(status)}
              onOpenDetails={setDetailsAppt}
            />
          ))}
        </div>
        <DragOverlay>
          {draggingCard && <AppointmentCardOverlay appointment={draggingCard} />}
        </DragOverlay>
      </DndContext>

      <Modal
        open={pendingCancelId !== null}
        onClose={() => setPendingCancelId(null)}
        title="إلغاء الموعد"
        width="max-w-md"
      >
        <div className="space-y-4">
          <p className="font-sans text-sm text-muted-foreground">
            الرجاء إدخال سبب إلغاء هذا الموعد.
          </p>
          <div className="space-y-1.5">
            <label className="font-sans text-sm font-medium text-foreground">سبب الإلغاء</label>
            <textarea
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              rows={3}
              placeholder="أدخل سبب الإلغاء..."
              className="w-full resize-none rounded-xl border border-border bg-background px-3 py-2 font-sans text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
          <div className="flex gap-3">
            <button
              onClick={confirmCancel}
              disabled={!cancelReason.trim()}
              className="flex-1 rounded-xl bg-red-500 py-2.5 font-sans text-sm font-medium text-white transition-colors hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-50"
            >
              تأكيد الإلغاء
            </button>
            <button
              type="button"
              onClick={() => setPendingCancelId(null)}
              className="rounded-xl border border-border px-4 font-sans text-sm font-medium text-foreground transition-colors hover:bg-muted"
            >
              تراجع
            </button>
          </div>
        </div>
      </Modal>

      <Modal
        open={detailsAppt !== null}
        onClose={() => setDetailsAppt(null)}
        title="تفاصيل الموعد"
        width="max-w-md"
      >
        {detailsAppt && (
          <div className="space-y-4 font-sans">
            <div className="flex items-center justify-between">
              <span className="text-lg font-semibold text-foreground">
                {detailsAppt.patient.fullName}
              </span>
              <AppointmentStatusBadge status={detailsAppt.status} />
            </div>

            <div className="space-y-3 text-sm">
              <DetailRow icon={User} label="المريض">
                {detailsAppt.patient.fullName}
              </DetailRow>
              {detailsAppt.patient.phone && (
                <DetailRow icon={Phone} label="هاتف المريض">
                  <span dir="ltr">{detailsAppt.patient.phone}</span>
                </DetailRow>
              )}
              <DetailRow icon={Stethoscope} label="الطبيب">
                {detailsAppt.doctor.profile.fullName}
                {detailsAppt.doctor.specialty ? ` · ${detailsAppt.doctor.specialty}` : ""}
              </DetailRow>
              <DetailRow icon={MapPin} label="الفرع">
                {detailsAppt.branch?.name ?? "—"}
              </DetailRow>
              <DetailRow icon={Calendar} label="التاريخ">
                {detailsAppt.slot
                  ? formatSlotDate(detailsAppt.slot.date)
                  : detailsAppt.bookingDate
                    ? formatSlotDate(detailsAppt.bookingDate)
                    : "—"}
              </DetailRow>
              <DetailRow icon={Clock} label={detailsAppt.slot ? "الوقت" : "الدور"}>
                {detailsAppt.slot ? (
                  <span dir="ltr">
                    {formatSlotTime(detailsAppt.slot.startTime)} –{" "}
                    {formatSlotTime(detailsAppt.slot.endTime)}
                  </span>
                ) : detailsAppt.orderNumber != null ? (
                  <span>دور رقم {detailsAppt.orderNumber}</span>
                ) : (
                  "—"
                )}
              </DetailRow>
              {detailsAppt.patientNotes && (
                <DetailRow icon={StickyNote} label="ملاحظات المريض">
                  {detailsAppt.patientNotes}
                </DetailRow>
              )}
              {detailsAppt.doctorNotes && (
                <DetailRow icon={StickyNote} label="ملاحظات الطبيب">
                  {detailsAppt.doctorNotes}
                </DetailRow>
              )}
              {detailsAppt.cancellationReason && (
                <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  <span className="font-medium">سبب الإلغاء: </span>
                  {detailsAppt.cancellationReason}
                </div>
              )}
            </div>

            <p className="border-t border-border pt-2 text-xs text-muted-foreground">
              تم الحجز في {formatSlotDate(detailsAppt.createdAt)}
            </p>

            <Link
              href={`/admin/appointments/${detailsAppt.id}`}
              className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-primary px-4 py-2.5 font-sans text-sm font-medium text-white transition-colors hover:bg-primary/90"
            >
              فتح صفحة الموعد الكاملة
            </Link>
          </div>
        )}
      </Modal>
    </>
  );
}

function DetailRow({
  icon: Icon,
  label,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3">
      <Icon className="mt-0.5 h-4 w-4 flex-shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-foreground">{children}</p>
      </div>
    </div>
  );
}
