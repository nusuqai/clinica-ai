import { continueHrefFor, getCurrentUser, getHostClinicOrNotFound } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ClinicLanding } from "@/components/landing/clinic-landing";
import { MarketingNav } from "@/components/marketing/marketing-nav";
import {
  SaasHero,
  SaasHowItWorks,
  SaasFeatures,
  RequestClinicSection,
  MarketingFooter,
} from "@/components/marketing/marketing-sections";
import { SaasFaq } from "@/components/marketing/saas-faq";

// `/` is host-dependent: a clinic's subdomain serves that clinic's public
// landing page, and the root domain serves the master SaaS landing page below,
// which markets the platform to clinics and routes a signed-in visitor onward
// into their own clinic.
export default async function LandingPage() {
  const clinic = await getHostClinicOrNotFound();
  if (clinic) return <ClinicLanding clinic={clinic} />;

  const user = await getCurrentUser();
  const isAuthenticated = !!user;
  const continueHref = user ? await continueHrefFor(user) : "/login";

  const clinicCount = await prisma.clinic.count({ where: { isActive: true } });

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <MarketingNav isAuthenticated={isAuthenticated} continueHref={continueHref} />

      <main className="flex-1">
        <SaasHero
          isAuthenticated={isAuthenticated}
          continueHref={continueHref}
          clinicCount={clinicCount}
        />
        <SaasHowItWorks />
        <SaasFeatures />
        <SaasFaq />
        <RequestClinicSection />
      </main>

      <MarketingFooter />
    </div>
  );
}
