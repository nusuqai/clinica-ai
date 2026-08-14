import { notFound } from "next/navigation";
import { AppointmentStatus, Role } from "@prisma/client";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { roleHome } from "@/lib/auth";
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
import { FooterSection } from "@/components/landing/footer-section";

// Public per-clinic landing page. Every active clinic gets one at
// /clinic/{slug}; visitors book here and sign up scoped to this clinic.
export default async function ClinicLandingPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  const clinic = await prisma.clinic.findFirst({
    where: { slug, isActive: true },
    select: { id: true, name: true, logoUrl: true },
  });
  if (!clinic) notFound();

  const base = `/clinic/${slug}`;
  const loginHref = `${base}/login`;
  const registerHref = `${base}/register`;

  // ── Auth check (who is viewing) ─────────────────────────────────────────────
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let isAuthenticated = false;
  let isPatient = false;
  let dashboardHref = loginHref;
  let memberRole: Role | null = null;

  if (user) {
    isAuthenticated = true;
    const membership = await prisma.clinicMember.findUnique({
      where: { userId_clinicId: { userId: user.id, clinicId: clinic.id } },
      select: { role: true },
    });
    if (membership) {
      memberRole = membership.role;
      isPatient = membership.role === Role.PATIENT;
      dashboardHref = roleHome(slug, membership.role);
    }
  }

  // ── Data (scoped to THIS clinic) ────────────────────────────────────────────
  const [doctors, allAppointments] = await Promise.all([
    DoctorService.listActiveDoctors(clinic.id),
    AppointmentService.listAppointments(clinic.id, {
      status: AppointmentStatus.COMPLETED,
    }),
  ]);

  const doctorCount = doctors.length;
  const appointmentCount = allAppointments.length;

  const specialtyCounts = new Map<string, number>();
  for (const d of doctors) {
    specialtyCounts.set(d.specialty, (specialtyCounts.get(d.specialty) ?? 0) + 1);
  }
  const specialties = Array.from(specialtyCounts, ([name, count]) => ({
    name,
    count,
  }));

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
        brandName={clinic.name}
        logoUrl={clinic.logoUrl}
        homeHref={base}
        loginHref={loginHref}
        registerHref={registerHref}
      />

      {/* Member banner — quick jump to their dashboard in this clinic */}
      {memberRole && (
        <div className="fixed left-1/2 top-20 z-40 -translate-x-1/2">
          <Link
            href={dashboardHref}
            className="rounded-full bg-primary/90 px-5 py-2 text-sm font-medium text-white shadow-lg backdrop-blur transition-opacity hover:opacity-90"
          >
            الذهاب إلى لوحة التحكم
          </Link>
        </div>
      )}

      <main className="flex-1">
        <HeroSection
          doctorCount={doctorCount}
          appointmentCount={appointmentCount}
          isAuthenticated={isAuthenticated}
          clinicName={clinic.name}
        />

        <HowItWorksSection />

        <section className="bg-background px-6 py-20">
          <div className="mx-auto max-w-7xl">
            <DoctorsClient
              doctors={serialisedDoctors}
              isAuthenticated={isAuthenticated}
              isPatient={isPatient}
              appointmentsHref={
                isPatient ? `${dashboardHref}/appointments` : undefined
              }
              loginHref={loginHref}
              registerHref={registerHref}
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
      </main>

      <FooterSection
        brandName={clinic.name}
        tagline={`${clinic.name} — احجز موعدك مع أطبائنا بسهولة وأمان`}
        loginHref={loginHref}
        registerHref={registerHref}
      />
    </div>
  );
}
