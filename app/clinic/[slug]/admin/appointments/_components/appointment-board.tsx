"use client";

import { useMemo, useState, useTransition } from "react";
import { DndContext, type DragEndEvent, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import { Search, X, Calendar, Clock, Stethoscope, MapPin, Phone, User, StickyNote } from "lucide-react";
import { toast } from "sonner";
import { AppointmentStatus } from "@prisma/client";
import { updateAppointmentStatusAction } from "@/server/actions/admin";
import type { AdminAppointment } from "@/server/services/appointments";
import { canTransition } from "@/lib/appointment-transitions";
import { APPOINTMENT_STATUS_LABELS } from "@/lib/labels";
import { formatSlotDate, formatSlotTime } from "@/lib/slot-time";
import { AppointmentStatusBadge } from "@/components/admin/status-badge";
import Modal from "@/components/admin/modal";
import BoardColumn from "./board-column";

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

export default function AppointmentBoard({ appointments: initial, doctors }: AppointmentBoardProps) {
  const [appointments, setAppointments] = useState(initial);
  const [pendingCancelId, setPendingCancelId] = useState<string | null>(null);
  const [cancelReason, setCancelReason] = useState("");
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
      if (dateFilter && toDateInputValue(new Date(appt.slot.date)) !== dateFilter) return false;
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
          ? { ...a, status, cancellationReason: status === AppointmentStatus.CANCELLED ? (cancellationReason ?? null) : a.cancellationReason }
          : a,
      ),
    );
  }

  function commitStatus(id: string, previousStatus: AppointmentStatus, status: AppointmentStatus, reason?: string) {
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
        `لا يمكن نقل الموعد من "${APPOINTMENT_STATUS_LABELS[appointment.status]}" إلى "${APPOINTMENT_STATUS_LABELS[newStatus]}".`,
      );
      return;
    }

    if (newStatus === AppointmentStatus.CANCELLED) {
      setPendingCancelId(appointment.id);
      setCancelReason("");
      return;
    }

    const previousStatus = appointment.status;
    applyStatus(appointment.id, newStatus);
    commitStatus(appointment.id, previousStatus, newStatus);
  }

  function confirmCancel() {
    if (!pendingCancelId || !cancelReason.trim()) return;
    const appointment = appointments.find((a) => a.id === pendingCancelId);
    if (!appointment) return;

    const previousStatus = appointment.status;
    applyStatus(appointment.id, AppointmentStatus.CANCELLED, cancelReason.trim());
    commitStatus(appointment.id, previousStatus, AppointmentStatus.CANCELLED, cancelReason.trim());
    setPendingCancelId(null);
    setCancelReason("");
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <div className="relative">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            value={patientQuery}
            onChange={(e) => setPatientQuery(e.target.value)}
            placeholder="بحث باسم المريض..."
            className="pr-9 pl-3 py-2 text-sm font-sans border border-border rounded-xl bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 w-56"
          />
        </div>

        <select
          value={doctorFilter}
          onChange={(e) => setDoctorFilter(e.target.value)}
          className="px-3 py-2 text-sm font-sans border border-border rounded-xl bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
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
          className="px-3 py-2 text-sm font-sans border border-border rounded-xl bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
        />

        {hasActiveFilters && (
          <button
            type="button"
            onClick={clearFilters}
            className="inline-flex items-center gap-1 px-3 py-2 text-sm font-sans text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="w-4 h-4" />
            مسح الفلاتر
          </button>
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
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground font-sans">
            الرجاء إدخال سبب إلغاء هذا الموعد.
          </p>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground font-sans">
              سبب الإلغاء
            </label>
            <textarea
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              rows={3}
              placeholder="أدخل سبب الإلغاء..."
              className="w-full border border-border rounded-xl px-3 py-2 text-sm bg-background text-foreground font-sans focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none"
            />
          </div>
          <div className="flex gap-3">
            <button
              onClick={confirmCancel}
              disabled={!cancelReason.trim()}
              className="flex-1 bg-red-500 text-white rounded-xl py-2.5 text-sm font-medium font-sans hover:bg-red-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              تأكيد الإلغاء
            </button>
            <button
              type="button"
              onClick={() => setPendingCancelId(null)}
              className="px-4 border border-border rounded-xl text-sm font-medium font-sans text-foreground hover:bg-muted transition-colors"
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
                {formatSlotDate(detailsAppt.slot.date)}
              </DetailRow>
              <DetailRow icon={Clock} label="الوقت">
                <span dir="ltr">
                  {formatSlotTime(detailsAppt.slot.startTime)} – {formatSlotTime(detailsAppt.slot.endTime)}
                </span>
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
                <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-3 py-2 text-sm">
                  <span className="font-medium">سبب الإلغاء: </span>
                  {detailsAppt.cancellationReason}
                </div>
              )}
            </div>

            <p className="text-xs text-muted-foreground pt-2 border-t border-border">
              تم الحجز في {formatSlotDate(detailsAppt.createdAt)}
            </p>
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
      <Icon className="w-4 h-4 text-muted-foreground mt-0.5 flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-foreground">{children}</p>
      </div>
    </div>
  );
}
