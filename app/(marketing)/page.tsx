import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { MarketingNav } from "@/components/marketing/marketing-nav";
import {
  SaasHero,
  SaasHowItWorks,
  SaasFeatures,
  RequestClinicSection,
  MarketingFooter,
} from "@/components/marketing/marketing-sections";
import { SaasFaq } from "@/components/marketing/saas-faq";

// Master SaaS landing page: markets the platform to clinics. Per-clinic public
// pages live at /clinic/[slug]; this page routes signed-in users onward.
export default async function LandingPage() {
  const user = await getCurrentUser();
  const isAuthenticated = !!user;
  const continueHref = user?.profile.isPlatformAdmin ? "/platform" : "/clinics";

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
