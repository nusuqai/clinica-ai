import Link from "next/link";
import {
  CalendarDays,
  CalendarPlus,
  Clock,
  Hash,
  MapPin,
  ArrowLeft,
  FileText,
  Stethoscope,
} from "lucide-react";
import type { PatientAppointment } from "@/server/services/appointments";
import type { TreatmentRecordView } from "@/server/services/treatments";
import { AppointmentStatusBadge } from "@/components/admin/status-badge";
import { CancelAppointmentButton } from "@/components/dashboard/cancel-appointment-button";
import RecordTimeline from "@/components/medical/record-timeline";
import { PatientHistoryPanels } from "@/components/landing/patient-history-panels";
import { formatSlotDate, formatSlotTime } from "@/lib/slot-time";

// The signed-in patient's area on the clinic's own home page, right under the
// hero: upcoming bookings as cards, plus past visits and the treatment record
// as panels that expand in place — so a patient who opens demo.clinica… sees
// their history without going into the dashboard. Everything passed in is
// already scoped to this clinic.

/** The visit's day: the slot's date, or the booking date for queue bookings. */
function visitDate(appt: PatientAppointment): Date | null {
  return appt.slot?.date ?? appt.bookingDate;
}

/**
 * One-line "when" for an appointment — e.g. "الأحد 12 أكتوبر · 10:00 ص" or
 * "الأحد 12 أكتوبر · دورك رقم 3". Shared with the hero's next-visit banner.
 */
export function describeWhen(appt: PatientAppointment): string {
  const date = visitDate(appt);
  const day = date ? formatSlotDate(date, { weekday: "long", day: "numeric", month: "long" }) : "";
  const time = appt.slot
    ? formatSlotTime(appt.slot.startTime)
    : appt.orderNumber != null
      ? `دورك رقم ${appt.orderNumber}`
      : "";
  return [day, time].filter(Boolean).join(" · ");
}

interface MyAppointmentsSectionProps {
  clinicName: string;
  /** Upcoming bookings, nearest first. */
  appointments: PatientAppointment[];
  /** Completed visits, newest first (capped at PAST_VISITS_LIMIT). */
  pastVisits: PatientAppointment[];
  records: TreatmentRecordView[];
  stats: { upcoming: number; completed: number; total: number };
}

export function MyAppointmentsSection({
  clinicName,
  appointments,
  pastVisits,
  records,
  stats,
}: MyAppointmentsSectionProps) {
  return (
    <section id="my-appointments" className="scroll-mt-20 bg-muted/40 px-6 py-16">
      <div className="mx-auto max-w-7xl">
        {/* Header */}
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="mb-2 inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 font-sans text-xs font-medium text-primary">
              <CalendarDays className="h-3.5 w-3.5" />
              حجوزاتي في {clinicName}
            </p>
            <h2 className="font-heading text-3xl font-bold text-foreground">مواعيدي القادمة</h2>
            <p className="mt-1 font-sans text-sm text-muted-foreground">
              {stats.upcoming === 0
                ? "لا توجد لديك مواعيد قادمة حالياً"
                : `لديك ${stats.upcoming} ${stats.upcoming === 1 ? "موعد قادم" : "مواعيد قادمة"}`}
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <a
              href="#book"
              className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 font-sans text-sm font-medium text-white shadow-sm transition-opacity hover:opacity-90"
            >
              <CalendarPlus className="h-4 w-4" />
              احجز موعداً جديداً
            </a>
            <Link
              href="/dashboard/appointments"
              className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-2.5 font-sans text-sm font-medium text-foreground transition-colors hover:border-primary/40 hover:text-primary"
            >
              كل مواعيدي
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </div>
        </div>

        {appointments.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {appointments.map((appt, i) => (
              <AppointmentCard key={appt.id} appt={appt} isNext={i === 0} />
            ))}
          </div>
        )}

        {/* Past visits + treatment record, expanding inline on this page */}
        <PatientHistoryPanels
          completedCount={stats.completed}
          recordCount={records.length}
          totalCount={stats.total}
          pastVisits={<PastVisitsList visits={pastVisits} records={records} />}
          records={<RecordTimeline records={records} emptyMessage="لا يوجد سجل علاجي بعد" />}
        />
      </div>
    </section>
  );
}

// ─── Past visits ──────────────────────────────────────────────────────────────

function PastVisitsList({
  visits,
  records,
}: {
  visits: PatientAppointment[];
  records: TreatmentRecordView[];
}) {
  // Which visits the doctor documented — shown as a badge on the visit.
  const documented = new Set(records.flatMap((r) => (r.appointmentId ? [r.appointmentId] : [])));

  if (visits.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 py-10 text-center">
        <CalendarDays className="h-10 w-10 text-muted-foreground/30" />
        <p className="font-sans text-sm text-muted-foreground">لا توجد زيارات مكتملة بعد</p>
      </div>
    );
  }

  return (
    <div>
      <ul className="divide-y divide-border">
        {visits.map((appt) => {
          const date = visitDate(appt);
          return (
            <li key={appt.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3">
              <div className="flex h-11 w-11 flex-shrink-0 flex-col items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-700">
                {date ? (
                  <>
                    <span className="font-heading text-base font-bold leading-none">
                      {formatSlotDate(date, { day: "numeric" })}
                    </span>
                    <span className="font-sans text-[10px] font-medium">
                      {formatSlotDate(date, { month: "short" })}
                    </span>
                  </>
                ) : (
                  <CalendarDays className="h-5 w-5" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate font-sans font-medium text-foreground">
                  د. {appt.doctor.profile.fullName}
                </p>
                <p className="font-sans text-xs text-muted-foreground">
                  {[
                    appt.doctor.specialty,
                    appt.branch?.name,
                    date && formatSlotDate(date, { year: "numeric" }),
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </div>
              {documented.has(appt.id) && (
                <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-0.5 font-sans text-xs font-medium text-primary">
                  <FileText className="h-3 w-3" />
                  له سجل علاجي
                </span>
              )}
              <AppointmentStatusBadge status={appt.status} />
            </li>
          );
        })}
      </ul>
      {visits.length >= PAST_VISITS_LIMIT && (
        <Link
          href="/dashboard/appointments?status=COMPLETED"
          className="mt-3 inline-flex items-center gap-1 font-sans text-sm font-medium text-primary hover:underline"
        >
          عرض كل الزيارات
          <ArrowLeft className="h-4 w-4" />
        </Link>
      )}
    </div>
  );
}

/** How many past visits the home page lists before linking to the full list. */
export const PAST_VISITS_LIMIT = 10;

// ─── Pieces ───────────────────────────────────────────────────────────────────

function AppointmentCard({ appt, isNext }: { appt: PatientAppointment; isNext: boolean }) {
  const date = visitDate(appt);

  return (
    <article
      className={[
        "flex overflow-hidden rounded-2xl border bg-card shadow-sm transition-shadow hover:shadow-md",
        isNext ? "border-primary/40 ring-1 ring-primary/20" : "border-border",
      ].join(" ")}
    >
      {/* Date block */}
      <div
        className={[
          "flex w-20 flex-shrink-0 flex-col items-center justify-center gap-0.5 px-2 py-4 text-center",
          isNext ? "bg-primary text-white" : "bg-primary/10 text-primary",
        ].join(" ")}
      >
        {date ? (
          <>
            <span className="font-sans text-[11px] font-medium opacity-80">
              {formatSlotDate(date, { weekday: "short" })}
            </span>
            <span className="font-heading text-3xl font-bold leading-none">
              {formatSlotDate(date, { day: "numeric" })}
            </span>
            <span className="font-sans text-xs font-medium opacity-80">
              {formatSlotDate(date, { month: "short" })}
            </span>
          </>
        ) : (
          <CalendarDays className="h-6 w-6" />
        )}
      </div>

      {/* Details */}
      <div className="flex min-w-0 flex-1 flex-col gap-2.5 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <AppointmentStatusBadge status={appt.status} />
          {isNext && (
            <span className="rounded-full bg-accent/15 px-2.5 py-0.5 font-sans text-xs font-medium text-accent">
              الأقرب
            </span>
          )}
        </div>

        <div className="min-w-0">
          <p className="flex items-center gap-1.5 truncate font-sans font-semibold text-foreground">
            <Stethoscope className="h-4 w-4 flex-shrink-0 text-primary" />
            د. {appt.doctor.profile.fullName}
          </p>
          {appt.doctor.specialty && (
            <p className="mt-0.5 ps-[1.375rem] font-sans text-xs text-muted-foreground">
              {appt.doctor.specialty}
            </p>
          )}
        </div>

        <div className="space-y-1.5 font-sans text-sm text-muted-foreground">
          {appt.slot ? (
            <p className="flex items-center gap-1.5">
              <Clock className="h-4 w-4 flex-shrink-0" />
              <span dir="ltr">
                {formatSlotTime(appt.slot.startTime)} – {formatSlotTime(appt.slot.endTime)}
              </span>
            </p>
          ) : appt.orderNumber != null ? (
            <>
              <p className="flex items-center gap-1.5 text-foreground">
                <Hash className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                دورك رقم <span className="font-bold">{appt.orderNumber}</span>
                {appt.expectedTime && (
                  <span className="text-muted-foreground">· متوقع ~{appt.expectedTime}</span>
                )}
              </p>
              {/* Live queue position — only when the clinic tracks "now serving". */}
              {appt.currentOrder != null && (
                <p className="flex items-center gap-1.5 rounded-lg bg-blue-50 px-2 py-1 text-xs text-blue-700">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-blue-500" />
                  يُخدم الآن: رقم {appt.currentOrder}
                  {appt.estimatedWaitMin != null && ` · انتظار ~${appt.estimatedWaitMin} دقيقة`}
                </p>
              )}
            </>
          ) : null}
          {appt.branch && (
            <p className="flex items-center gap-1.5">
              <MapPin className="h-4 w-4 flex-shrink-0" />
              {appt.branch.name}
            </p>
          )}
        </div>

        <div className="mt-auto pt-1">
          <CancelAppointmentButton appointmentId={appt.id} status={appt.status} />
        </div>
      </div>
    </article>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border bg-card px-6 py-14 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
        <CalendarDays className="h-7 w-7 text-primary" />
      </div>
      <p className="font-heading text-lg font-semibold text-foreground">لا توجد مواعيد قادمة</p>
      <p className="max-w-sm font-sans text-sm text-muted-foreground">
        اختر طبيبك من القائمة بالأسفل واحجز الوقت المناسب لك في ثوانٍ.
      </p>
      <a
        href="#book"
        className="mt-1 inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 font-sans text-sm font-medium text-white transition-opacity hover:opacity-90"
      >
        <CalendarPlus className="h-4 w-4" />
        احجز موعدك الآن
      </a>
    </div>
  );
}
