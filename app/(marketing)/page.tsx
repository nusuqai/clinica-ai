import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import * as DoctorService from "@/server/services/doctors";
import * as AppointmentService from "@/server/services/appointments";

import { LandingNav } from "@/components/landing/landing-nav";
import { HeroSection } from "@/components/landing/hero-section";
import { DoctorsClient } from "@/components/landing/doctors-client";
import { FooterSection } from "@/components/landing/footer-section";

export default async function LandingPage() {
  // ── Auth check ──────────────────────────────────────────────────────────────
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let isAuthenticated = false;
  let isPatient = false;

  if (user) {
    isAuthenticated = true;
    const profile = await prisma.profile.findUnique({
      where: { id: user.id },
      select: { role: true },
    });

    if (profile?.role === "DOCTOR") redirect("/doctor");
    if (profile?.role === "ADMIN") redirect("/admin");

    isPatient = profile?.role === "PATIENT";
  }

  // ── Data fetching ────────────────────────────────────────────────────────────
  const [doctors, allAppointments] = await Promise.all([
    DoctorService.listActiveDoctors(),
    AppointmentService.listAppointments({ status: "COMPLETED" }),
  ]);

  const doctorCount = doctors.length;
  const appointmentCount = allAppointments.length;

  // Serialise Prisma Decimal + Date fields for client components
  const serialisedDoctors = doctors.map((d) => ({
    id: d.id,
    specialty: d.specialty,
    consultationFee: d.consultationFee ? Number(d.consultationFee) : null,
    isActive: d.isActive,
    profile: {
      fullName: d.profile.fullName,
      phone: d.profile.phone,
    },
    _count: { appointments: d._count.appointments },
  }));

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <LandingNav isAuthenticated={isAuthenticated} isPatient={isPatient} />

      <main className="flex-1">
        {/* Hero */}
        <HeroSection
          doctorCount={doctorCount}
          appointmentCount={appointmentCount}
          isAuthenticated={isAuthenticated}
        />

        {/* Doctors section */}
        <section className="bg-background px-6 py-20">
          <div className="mx-auto max-w-7xl">
            <DoctorsClient
              doctors={serialisedDoctors}
              isAuthenticated={isAuthenticated}
              isPatient={isPatient}
            />
          </div>
        </section>
      </main>

      <FooterSection />
    </div>
  );
}
