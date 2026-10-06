"use client";

import { useMemo, useState, useTransition } from "react";
import { DndContext, type DragEndEvent, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
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
import { updateAppointmentStatusAction } from "@/server/actions/admin";
import type { AdminAppointment } from "@/server/services/appointments";
import { canTransition } from "@/lib/appointment-transitions";
import { APPOINTMENT_STATUS_LABELS } from "@/lib/labels";
import { formatSlotDate, formatSlotTime } from "@/lib/slot-time";
import { AppointmentStatusBadge } from "@/components/admin/status-badge";
import Modal from "@/components/admin/modal";
import { CancelReasonForm } from "@/components/appointments/cancel-reason-form";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import BoardColumn from "./board-column";
import { Alert } from "@/components/ui/alert";

interface DoctorOption {
  id: string;
  fullName: string;
  specialty: string;
}

function toDateInputValue(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

const STATUS_ORDER: AppointmentStatus[] = [
  AppointmentStatus.PENDING,
  AppointmentStatus.CONFIRMED,
  AppointmentStatus.COMPLETED,
  AppointmentStatus.CANCELLED,
  AppointmentStatus.NO_SHOW,
];

interface AppointmentBoardProps {
  appointments: AdminAppointment[];
  doctors: DoctorOption[];
}

export default function AppointmentBoard({
  appointments: initial,
  doctors,
}: AppointmentBoardProps) {
  const [appointments, setAppointments] = useState(initial);
  const [pendingCancelId, setPendingCancelId] = useState<string | null>(null);
  const [detailsAppt, setDetailsAppt] = useState<AdminAppointment | null>(null);
  const [, startTransition] = useTransition();

  const [doctorFilter, setDoctorFilter] = useState("");
  const [patientQuery, setPatientQuery] = useState("");
  const [dateFilter, setDateFilter] = useState("");

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const hasActiveFilters = doctorFilter !== "" || patientQuery.trim() !== "" || dateFilter !== "";

  function clearFilters() {
    setDoctorFilter("");
    setPatientQuery("");
    setDateFilter("");
  }

  const filteredAppointments = useMemo(() => {
    const query = patientQuery.trim().toLowerCase();
    return appointments.filter((appt) => {
      if (doctorFilter && appt.doctorId !== doctorFilter) return false;
      if (query && !appt.patient.fullName.toLowerCase().includes(query)) return false;
      const apptDate = appt.slot?.date ?? appt.bookingDate;
      if (dateFilter && (!apptDate || toDateInputValue(new Date(apptDate)) !== dateFilter))
        return false;
      return true;
    });
  }, [appointments, doctorFilter, patientQuery, dateFilter]);

  const columns = useMemo(() => {
    const grouped: Record<AppointmentStatus, AdminAppointment[]> = {
      [AppointmentStatus.PENDING]: [],
      [AppointmentStatus.CONFIRMED]: [],
      [AppointmentStatus.COMPLETED]: [],
      [AppointmentStatus.CANCELLED]: [],
      [AppointmentStatus.NO_SHOW]: [],
    };
    for (const appt of filteredAppointments) grouped[appt.status].push(appt);
    return grouped;
  }, [filteredAppointments]);

  function applyStatus(id: string, status: AppointmentStatus, cancellationReason?: string) {
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
        applyStatus(id, previousStatus);
        toast.error(res.error);
      }
    });
  }

  function handleDragEnd(event: DragEndEvent) {
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
      return;
    }

    const previousStatus = appointment.status;
    applyStatus(appointment.id, newStatus);
    commitStatus(appointment.id, previousStatus, newStatus);
  }

  function confirmCancel(reason: string) {
    if (!pendingCancelId) return;
    const appointment = appointments.find((a) => a.id === pendingCancelId);
    if (!appointment) return;

    const previousStatus = appointment.status;
    applyStatus(appointment.id, AppointmentStatus.CANCELLED, reason);
    commitStatus(appointment.id, previousStatus, AppointmentStatus.CANCELLED, reason);
    setPendingCancelId(null);
  }

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <FormField
          type="search"
          value={patientQuery}
          onValueChange={setPatientQuery}
          placeholder="بحث باسم المريض..."
          startIcon={<Search />}
          className="w-56"
        />

        <FormField
          type="select"
          value={doctorFilter}
          onValueChange={setDoctorFilter}
          options={[
            { value: "", label: "كل الأطباء" },
            ...doctors.map((doc) => ({
              value: doc.id,
              label: `${doc.fullName} · ${doc.specialty}`,
            })),
          ]}
          className="w-56"
        />

        <FormField
          type="date"
          value={dateFilter}
          onValueChange={setDateFilter}
          placeholder="كل التواريخ"
          className="w-48"
        />

        {hasActiveFilters && (
          <Button type="button" variant="ghost" onClick={clearFilters}>
            <X />
            مسح الفلاتر
          </Button>
        )}
      </div>

      <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
        <div className="flex gap-4 overflow-x-auto pb-4">
          {STATUS_ORDER.map((status) => (
            <BoardColumn
              key={status}
              status={status}
              label={APPOINTMENT_STATUS_LABELS[status]}
              appointments={columns[status]}
              onOpenDetails={setDetailsAppt}
            />
          ))}
        </div>
      </DndContext>

      <Modal
        open={pendingCancelId !== null}
        onClose={() => setPendingCancelId(null)}
        title="إلغاء الموعد"
        width="max-w-md"
      >
        <CancelReasonForm
          prompt="الرجاء إدخال سبب إلغاء هذا الموعد."
          required
          onConfirm={confirmCancel}
          onBack={() => setPendingCancelId(null)}
        />
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
                <Alert variant="destructive" className="block px-3 py-2">
                  <span className="font-medium">سبب الإلغاء: </span>
                  {detailsAppt.cancellationReason}
                </Alert>
              )}
            </div>

            <p className="border-t border-border pt-2 text-xs text-muted-foreground">
              تم الحجز في {formatSlotDate(detailsAppt.createdAt)}
            </p>

            <Button asChild className="flex h-auto w-full gap-1.5 rounded-xl px-4 py-2.5 text-sm">
              <Link href={`/admin/appointments/${detailsAppt.id}`}>فتح صفحة الموعد الكاملة</Link>
            </Button>
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
