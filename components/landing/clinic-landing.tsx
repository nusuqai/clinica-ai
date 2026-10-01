import { AppointmentStatus, Role } from "@prisma/client";
import Link from "next/link";
import { getClinicContext, getCurrentUser, roleHome, type ClinicSummary } from "@/lib/auth";
import * as DoctorService from "@/server/services/doctors";
import * as AppointmentService from "@/server/services/appointments";
import { LandingNav } from "@/components/landing/landing-nav";
import { HeroSection } from "@/components/landing/hero-section";
import { HowItWorksSection } from "@/components/landing/how-it-works-section";
import {
  MyAppointmentsSection,
  describeWhen,
  visitTime,
} from "@/components/landing/my-appointments-section";
import ChatBubble from "@/components/chat/chat-bubble";
import * as TreatmentService from "@/server/services/treatments";
import * as ConnectionService from "@/server/services/connections";
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
  const [doctors, allAppointments, myUpcoming, myStats, myPastVisits, myRecords, myRelatives] =
    await Promise.all([
      DoctorService.listActiveDoctors(clinic.id),
      AppointmentService.listAppointments(clinic.id, {
        status: AppointmentStatus.COMPLETED,
      }),
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
      isPatient && ctx
        ? AppointmentService.getPatientAppointments(ctx.user.id, {
            clinicId: clinic.id,
            status: AppointmentStatus.COMPLETED,
          })
        : Promise.resolve([]),
      isPatient && ctx
        ? TreatmentService.listPatientRecords({ clinicId: clinic.id, patientId: ctx.user.id })
        : Promise.resolve([]),
      // Relatives the patient may book for — offered in the booking modal.
      isPatient && ctx
        ? ConnectionService.listBookableDependents(clinic.id, ctx.user.id)
        : Promise.resolve([]),
    ]);
  // Upcoming bookings for the patient AND the relatives they book for, merged
  // into one list by visit time; each card says whose appointment it is.
  const relativesUpcoming = await Promise.all(
    myRelatives.map(async (r) =>
      (
        await AppointmentService.getPatientAppointments(r.id, {
          clinicId: clinic.id,
          upcoming: true,
          limit: 6,
        })
      ).map((appt) => ({
        appt,
        forPatient: { name: r.fullName, relation: r.relation },
        canOpenDetails: r.canViewRecords,
      }))
    )
  );
  const upcomingForAll = [
    ...(myUpcoming ?? []).map((appt) => ({
      appt,
      forPatient: null,
      canOpenDetails: true,
    })),
    ...relativesUpcoming.flat(),
  ].sort((a, b) => visitTime(a.appt) - visitTime(b.appt));

  const nextAppointment = myUpcoming?.[0]
    ? { doctorName: myUpcoming[0].doctor.profile.fullName, when: describeWhen(myUpcoming[0]) }
    : null;

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

        {myUpcoming && myStats && (
          <MyAppointmentsSection
            clinicName={clinic.name}
            appointments={upcomingForAll}
            pastVisits={myPastVisits}
            records={myRecords}
            stats={myStats}
          />
        )}

        <HowItWorksSection />

        <section className="bg-background px-6 py-20">
          <div className="mx-auto max-w-7xl">
            <DoctorsClient
              doctors={serialisedDoctors}
              isAuthenticated={isAuthenticated}
              isPatient={isPatient}
              relatives={myRelatives.map((r) => ({
                id: r.id,
                fullName: r.fullName,
                relation: r.relation,
              }))}
              appointmentsHref={isPatient ? "/#my-appointments" : undefined}
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

      {/* AI assistant — on the clinic's public home page for everyone. A signed-in
          member chats with their clinic's agent; an anonymous visitor chats as a
          guest (info only, told to sign in / register before booking). Hidden for
          a platform admin browsing a clinic they aren't a member of — they have
          no membership to scope the chat and manage conversations from the inbox. */}
      {!ctx?.viaPlatformAdmin && <ChatBubble guest={!isAuthenticated} />}
    </div>
  );
}
