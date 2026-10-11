import { AppointmentStatus, Role } from "@prisma/client";
import Link from "next/link";
import { getClinicContext, getCurrentUser, roleHome, type ClinicSummary } from "@/lib/auth";
import * as DoctorService from "@/server/services/doctors";
import * as AppointmentService from "@/server/services/appointments";
import { LandingNav } from "@/components/landing/landing-nav";
import { HeroSection } from "@/components/landing/hero-section";
import { HowItWorksSection } from "@/components/landing/how-it-works-section";
import { MyAppointmentsSection, describeWhen } from "@/components/landing/my-appointments-section";
import ChatBubble from "@/components/chat/chat-bubble";
import {
  myPastVisitsPageAction,
  myRecordsPageAction,
  myHistoryDoctorsAction,
  publicDoctorsPageAction,
} from "@/server/actions/patient";
import { DoctorsClient } from "@/components/landing/doctors-client";
import { FeaturesSection } from "@/components/landing/features-section";
import { SpecialtiesSection } from "@/components/landing/specialties-section";
import { StatsSection } from "@/components/landing/stats-section";
import { FAQSection } from "@/components/landing/faq-section";
import { FooterSection } from "@/components/landing/footer-section";

// Public per-clinic landing page — what `/` serves on a clinic's own subdomain.
// Visitors book here and sign up scoped to this clinic.
export async function ClinicLanding({ clinic }: { clinic: ClinicSummary }) {
  const loginHref = "/login";
  const registerHref = "/register";

  // ── Auth check (who is viewing) ─────────────────────────────────────────────
  // getClinicContext is the single source of truth for access to this clinic, so
  // a platform admin — a member of no clinic but an admin of all of them — gets
  // the same way in here as everywhere else. getCurrentUser stays separate: a
  // visitor signed in to a DIFFERENT clinic is still signed in, they just have
  // no dashboard here to jump to.
  const [user, ctx] = await Promise.all([getCurrentUser(), getClinicContext()]);

  const isAuthenticated = !!user;
  const accessRole: Role | null = ctx?.role ?? null;
  const isPatient = ctx?.role === Role.PATIENT;
  const dashboardHref = ctx ? roleHome(ctx.role) : loginHref;

  // ── Data (scoped to THIS clinic) ────────────────────────────────────────────
  const [
    doctorStats,
    firstDoctors,
    appointmentCount,
    myUpcoming,
    myStats,
    myPastVisits,
    myRecords,
    myHistoryDoctors,
  ] = await Promise.all([
    // Counts for the stats + specialty sections; the doctor cards are paged.
    DoctorService.activeDoctorStats(clinic.id),
    publicDoctorsPageAction({}, 1),
    // Only the number is shown — count, don't load every completed visit.
    AppointmentService.countAppointments(clinic.id, { status: AppointmentStatus.COMPLETED }),
    // A signed-in patient of THIS clinic also sees their own bookings here —
    // scoped to this clinic, so bookings made at another clinic never show up.
    isPatient && ctx
      ? AppointmentService.getPatientAppointments(ctx.user.id, {
          clinicId: clinic.id,
          upcoming: true,
          limit: 6,
        })
      : Promise.resolve(null),
    isPatient && ctx
      ? AppointmentService.getPatientStats(ctx.user.id, clinic.id)
      : Promise.resolve(null),
    // First pages of the history panels (unfiltered); the rest load on scroll.
    isPatient && ctx ? myPastVisitsPageAction({}, 1) : Promise.resolve(null),
    isPatient && ctx ? myRecordsPageAction({}, 1) : Promise.resolve(null),
    isPatient && ctx ? myHistoryDoctorsAction() : Promise.resolve([]),
  ]);
  const nextAppointment = myUpcoming?.[0]
    ? { doctorName: myUpcoming[0].doctor.profile.fullName, when: describeWhen(myUpcoming[0]) }
    : null;

  const doctorCount = doctorStats.count;
  const specialties = doctorStats.bySpecialty;

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <LandingNav
        isAuthenticated={isAuthenticated}
        isPatient={isPatient}
        userName={isPatient ? (ctx?.user.profile.fullName ?? null) : null}
        dashboardHref={dashboardHref}
        brandName={clinic.name}
        logoUrl={clinic.logoUrl}
        homeHref="/"
        loginHref={loginHref}
        registerHref={registerHref}
      />

      {/* Quick jump to the staff dashboard for a doctor/admin viewing the landing.
          Patients have no dashboard — this page IS their home — so it's not shown
          to them. */}
      {accessRole && accessRole !== Role.PATIENT && (
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
          nextAppointment={nextAppointment}
        />

        {myUpcoming && myStats && myPastVisits && myRecords && (
          <MyAppointmentsSection
            clinicName={clinic.name}
            appointments={myUpcoming}
            pastVisits={myPastVisits}
            records={myRecords}
            historyDoctors={myHistoryDoctors}
            stats={myStats}
          />
        )}

        <HowItWorksSection />

        <section className="bg-background px-6 py-20">
          <div className="mx-auto max-w-7xl">
            <DoctorsClient
              initial={firstDoctors}
              specialties={specialties}
              isAuthenticated={isAuthenticated}
              isPatient={isPatient}
              appointmentsHref={isPatient ? `${dashboardHref}/appointments` : undefined}
              loginHref={loginHref}
              registerHref={registerHref}
            />
          </div>
        </section>

        <FeaturesSection />
        <SpecialtiesSection specialties={specialties} />
        <StatsSection doctorCount={doctorCount} appointmentCount={appointmentCount} />
        <FAQSection />
      </main>

      <FooterSection
        brandName={clinic.name}
        tagline={`${clinic.name} — احجز موعدك مع أطبائنا بسهولة وأمان`}
        loginHref={loginHref}
        registerHref={registerHref}
      />

      {/* AI assistant — for patients and visitors only. A signed-in patient chats
          with their clinic's agent; an anonymous visitor chats as a guest (info
          only, told to sign in / register before booking). Hidden for the clinic's
          team (admins, staff, doctors) and for a platform admin: the assistant
          has nothing to do for them — they work from the dashboard and the inbox. */}
      {(!ctx || isPatient) && <ChatBubble guest={!isAuthenticated} />}
    </div>
  );
}
