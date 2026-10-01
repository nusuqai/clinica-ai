import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, FileText, Phone, Stethoscope } from "lucide-react";
import { requireClinicMember } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { authorizePatientHistory } from "@/server/services/treatmentAccess";
import { listPatientRecords } from "@/server/services/treatments";
import { listAttachmentsForAppointments } from "@/server/services/attachments";
import RecordTimeline from "@/components/medical/record-timeline";

// A relative's treatment record, opened from the patient's connections list.
// The same read rule as every other history page decides access: a relative
// whose link doesn't grant canViewRecords is a 404, not an empty page.

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function ConnectionRecordsPage({ params }: PageProps) {
  const { id } = await params;
  const { clinic, user } = await requireClinicMember(["PATIENT"]);
  if (id === user.id) notFound();

  const access = await authorizePatientHistory(id);
  if (!access.ok) notFound();

  const [person, records] = await Promise.all([
    prisma.profile.findUnique({ where: { id }, select: { fullName: true, phone: true } }),
    listPatientRecords({ clinicId: access.clinicId, patientId: id }),
  ]);
  if (!person) notFound();

  const appointmentIds = records.flatMap((r) => (r.appointmentId ? [r.appointmentId] : []));
  const attachmentsByAppointment = await listAttachmentsForAppointments(
    appointmentIds,
    access.clinicId
  );

  return (
    <div className="min-h-screen bg-muted/40">
      <header className="bg-primary px-6 pb-24 pt-6">
        <div className="mx-auto flex max-w-4xl items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            {clinic.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={clinic.logoUrl}
                alt={clinic.name}
                className="h-9 w-9 rounded-xl object-cover"
              />
            ) : (
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent">
                <Stethoscope className="h-5 w-5 text-white" />
              </div>
            )}
            <span className="font-heading text-xl font-bold text-white">{clinic.name}</span>
          </Link>
          <Link
            href="/profile"
            className="inline-flex items-center gap-1.5 rounded-lg border border-white/30 px-3 py-1.5 font-sans text-sm font-medium text-white transition-colors hover:border-accent hover:text-accent"
          >
            <ArrowRight className="h-4 w-4" />
            ملفي الشخصي
          </Link>
        </div>
      </header>

      <main className="mx-auto -mt-16 max-w-4xl space-y-6 px-6 pb-16">
        <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
          <div className="flex items-center gap-4">
            <div className="flex h-16 w-16 flex-shrink-0 items-center justify-center rounded-full bg-primary ring-4 ring-card">
              <span className="font-heading text-xl font-bold text-white">
                {person.fullName.trim().charAt(0) || "؟"}
              </span>
            </div>
            <div className="min-w-0">
              <h1 className="font-heading text-xl font-bold text-foreground">{person.fullName}</h1>
              <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 font-sans text-sm text-muted-foreground">
                {person.phone && (
                  <span className="flex items-center gap-1.5" dir="ltr">
                    <Phone className="h-3.5 w-3.5" />
                    {person.phone}
                  </span>
                )}
                <span>{records.length} زيارة مسجّلة</span>
              </div>
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
          <div className="mb-6 flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            <h2 className="font-heading font-semibold text-foreground">السجل العلاجي</h2>
          </div>
          <RecordTimeline
            records={records}
            emptyMessage={`لا يوجد سجل علاجي لـ ${person.fullName} بعد`}
            appointmentBasePath="/appointments"
            attachmentsByAppointment={attachmentsByAppointment}
          />
        </section>
      </main>
    </div>
  );
}
