import { redirect } from "next/navigation";
import { requireClinicMember } from "@/lib/auth";
import { getDoctorByProfileId } from "@/server/services/doctors";
import type { AppointmentStatus } from "@prisma/client";
import { APPOINTMENT_STATUS_LABELS } from "@/lib/labels";
import { myAppointmentsPageAction } from "@/server/actions/doctor";
import AppointmentsTable from "./_components/appointments-table";

interface PageProps {
  searchParams: Promise<{ status?: string }>;
}

export default async function DoctorAppointmentsPage({ searchParams }: PageProps) {
  const ctx = await requireClinicMember(["DOCTOR"]);
  const doctor = await getDoctorByProfileId(ctx.user.id, ctx.clinic.id);
  if (!doctor) redirect(`/`);

  const { status } = await searchParams;
  const filterStatus = Object.keys(APPOINTMENT_STATUS_LABELS).includes(status ?? "")
    ? (status as AppointmentStatus)
    : undefined;

  const appointments = await myAppointmentsPageAction(filterStatus, 1);

  return (
    <div>
      {/* Header */}
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="font-heading text-2xl font-bold text-foreground">المواعيد</h1>
          <p className="mt-1 font-sans text-sm text-muted-foreground">{appointments.total} موعد</p>
        </div>
      </div>

      {/* Status filter pills */}
      <div className="mb-6 flex flex-wrap gap-2">
        <a
          href={`/doctor/appointments`}
          className={[
            "rounded-full px-3 py-1.5 font-sans text-sm font-medium transition-colors",
            !filterStatus
              ? "bg-primary text-white"
              : "bg-muted text-muted-foreground hover:bg-muted/70",
          ].join(" ")}
        >
          الكل
        </a>
        {(Object.entries(APPOINTMENT_STATUS_LABELS) as [AppointmentStatus, string][]).map(
          ([val, label]) => (
            <a
              key={val}
              href={`/doctor/appointments?status=${val}`}
              className={[
                "rounded-full px-3 py-1.5 font-sans text-sm font-medium transition-colors",
                filterStatus === val
                  ? "bg-primary text-white"
                  : "bg-muted text-muted-foreground hover:bg-muted/70",
              ].join(" ")}
            >
              {label}
            </a>
          )
        )}
      </div>

      <AppointmentsTable initial={appointments} status={filterStatus} />
    </div>
  );
}
