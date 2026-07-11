import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import * as DoctorService from "@/server/services/doctors";
import * as AppointmentService from "@/server/services/appointments";

import { LandingNav } from "@/components/landing/landing-nav";
import { HeroSection } from "@/components/landing/hero-section";
import { HowItWorksSection } from "@/components/landing/how-it-works-section";
import { DoctorsClient } from "@/components/landing/doctors-client";
import { FeaturesSection } from "@/components/landing/features-section";
import { SpecialtiesSection } from "@/components/landing/specialties-section";
import { StatsSection } from "@/components/landing/stats-section";
import { FAQSection } from "@/components/landing/faq-section";
import { CTABannerSection } from "@/components/landing/cta-banner-section";
import { FooterSection } from "@/components/landing/footer-section";
import GuestChatBubble from "@/components/chat/guest-chat-bubble";

export default async function LandingPage() {
  // ── Auth check ──────────────────────────────────────────────────────────────
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let isAuthenticated = false;
  let isPatient = false;

  // Anonymous sessions (used for guest chat) must not appear as "logged in".
  if (user && !user.is_anonymous) {
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

  const specialtyCounts = new Map<string, number>();
  for (const d of doctors) {
    specialtyCounts.set(
      d.specialty,
      (specialtyCounts.get(d.specialty) ?? 0) + 1,
    );
  }
  const specialties = Array.from(specialtyCounts, ([name, count]) => ({
    name,
    count,
  }));

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

        <HowItWorksSection />

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

        <FeaturesSection />
        <SpecialtiesSection specialties={specialties} />
        <StatsSection
          doctorCount={doctorCount}
          appointmentCount={appointmentCount}
        />
        <FAQSection />
        <CTABannerSection />
      </main>

      <FooterSection />
      <GuestChatBubble />
    </div>
  );
}
