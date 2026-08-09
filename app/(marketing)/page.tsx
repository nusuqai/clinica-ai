import { redirect } from "next/navigation";
import { AppointmentStatus, Role } from "@prisma/client";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { roleHome } from "@/lib/auth";
import { DEFAULT_CLINIC_ID } from "@/lib/tenant";
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
import ChatBubble from "@/components/chat/chat-bubble";

export default async function LandingPage() {
  // ── Auth check ──────────────────────────────────────────────────────────────
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let isAuthenticated = false;
  let isPatient = false;
  let dashboardHref = "/";

  if (user) {
    isAuthenticated = true;
    const membership = await prisma.clinicMember.findFirst({
      where: { userId: user.id, clinic: { isActive: true } },
      orderBy: { createdAt: "asc" },
      select: { role: true, clinic: { select: { slug: true } } },
    });

    if (membership) {
      if (membership.role === Role.DOCTOR || membership.role === Role.ADMIN) {
        redirect(roleHome(membership.clinic.slug, membership.role));
      }
      isPatient = membership.role === Role.PATIENT;
      dashboardHref = `/clinic/${membership.clinic.slug}/dashboard`;
    }
  }

  // ── Data fetching (product landing shows the default/demo clinic) ─────────────
  const [doctors, allAppointments] = await Promise.all([
    DoctorService.listActiveDoctors(DEFAULT_CLINIC_ID),
    AppointmentService.listAppointments(DEFAULT_CLINIC_ID, {
      status: AppointmentStatus.COMPLETED,
    }),
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
      <LandingNav
        isAuthenticated={isAuthenticated}
        isPatient={isPatient}
        dashboardHref={dashboardHref}
      />

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
              appointmentsHref={
                isPatient ? `${dashboardHref}/appointments` : undefined
              }
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
      <ChatBubble guest={!isAuthenticated} />
    </div>
  );
}
