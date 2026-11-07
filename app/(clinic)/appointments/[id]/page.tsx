import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { Role } from "@prisma/client";
import { requireClinicMember } from "@/lib/auth";
import { authorizeAppointmentView } from "@/server/services/appointmentAccess";
import { getAppointmentForDetail } from "@/server/services/appointments";
import { getRecordForAppointment } from "@/server/services/treatments";
import { listAppointmentAttachments } from "@/server/services/attachments";
import AppointmentDetail from "@/components/appointments/appointment-detail";
import { Button } from "@/components/ui/button";
import { ClinicLogo } from "@/components/general/clinic-logo";

// The patient's own read-only view of one of their appointments. Patients have
// no dashboard shell (their home is the clinic landing page), so this page
// carries its own brand band + way back home, like the profile page.

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function PatientAppointmentDetailPage({ params }: PageProps) {
  const { id } = await params;
  const { clinic } = await requireClinicMember(["PATIENT"]);

  const access = await authorizeAppointmentView(id);
  if (!access.ok) notFound();

  const appt = await getAppointmentForDetail(id, access.clinicId);
  if (!appt) notFound();

  const [record, attachments] = await Promise.all([
    getRecordForAppointment(id, access.clinicId),
    listAppointmentAttachments(id, access.clinicId),
  ]);

  return (
    <div className="min-h-screen bg-muted/40">
      <header className="bg-primary px-6 py-6">
        <div className="mx-auto flex max-w-3xl items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <ClinicLogo src={clinic.logoUrl} name={clinic.name} />
            <span className="font-heading text-xl font-bold text-white">{clinic.name}</span>
          </Link>
          <Button
            asChild
            variant="outline"
            className="h-auto gap-1.5 rounded-lg border-white/30 bg-transparent px-3 py-1.5 text-sm text-white hover:border-accent hover:bg-transparent hover:text-accent"
          >
            <Link href="/">
              <ArrowRight className="h-4 w-4" />
              الرئيسية
            </Link>
          </Button>
        </div>
      </header>

      <main className="px-6 py-8">
        <AppointmentDetail
          appt={appt}
          record={record}
          attachments={attachments}
          viewerRole={Role.PATIENT}
          canEdit={access.canEdit}
          backHref="/"
          backLabel="مواعيدي"
        />
      </main>
    </div>
  );
}
