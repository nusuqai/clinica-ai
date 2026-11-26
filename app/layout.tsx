import type { Metadata } from "next";
import { Tajawal, Cairo, Amiri } from "next/font/google";
import "./globals.css";
import { ConfirmProvider } from "@/components/ui/confirm-dialog";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { prisma } from "@/lib/prisma";
import { getTenantSlug } from "@/lib/tenant";
import { clinicOrigin, rootOrigin } from "@/lib/clinic-url";

// Brand fonts (preserved from the original app's Google Fonts link).
const tajawal = Tajawal({
  subsets: ["arabic", "latin"],
  weight: ["400", "500"],
  variable: "--font-tajawal",
  display: "swap",
});

const cairo = Cairo({
  subsets: ["arabic", "latin"],
  weight: ["700", "800"],
  variable: "--font-cairo",
  display: "swap",
});

const amiri = Amiri({
  subsets: ["arabic", "latin"],
  weight: ["400", "700"],
  style: ["italic"],
  variable: "--font-amiri",
  display: "swap",
});

const PLATFORM_NAME = "Clinica AI";
const PLATFORM_DESCRIPTION =
  "منصة Clinica AI تجمع بين الطب والذكاء الاصطناعي: حجز مواعيد، مساعد ذكي على واتساب، وإدارة متكاملة للعيادات.";

/**
 * Host-dependent metadata: a clinic's subdomain carries ITS name, description
 * and logo (tab title, favicon, link previews on WhatsApp/Facebook…) — nothing
 * of the platform. The root domain keeps the Clinica AI identity.
 */
export async function generateMetadata(): Promise<Metadata> {
  const slug = await getTenantSlug();
  const clinic = slug
    ? await prisma.clinic.findFirst({
        where: { slug, isActive: true },
        select: { slug: true, name: true, description: true, logoUrl: true },
      })
    : null;

  if (!clinic) {
    return {
      metadataBase: safeUrl(rootOrigin()),
      title: { default: PLATFORM_NAME, template: `%s | ${PLATFORM_NAME}` },
      description: PLATFORM_DESCRIPTION,
      applicationName: PLATFORM_NAME,
      icons: { icon: "/logo.png", apple: "/logo.png" },
      openGraph: {
        type: "website",
        locale: "ar_EG",
        siteName: PLATFORM_NAME,
        title: PLATFORM_NAME,
        description: PLATFORM_DESCRIPTION,
        images: ["/logo.png"],
      },
    };
  }

  const description =
    clinic.description?.trim().replace(/\s+/g, " ").slice(0, 300) ||
    `احجز موعدك في ${clinic.name} بسهولة وتابع رعايتك الصحية أونلاين.`;
  const logo = clinic.logoUrl || undefined;

  return {
    metadataBase: safeUrl(clinicOrigin(clinic.slug)),
    title: { default: clinic.name, template: `%s | ${clinic.name}` },
    description,
    applicationName: clinic.name,
    // No logo → no icon at all, rather than falling back to the platform's.
    icons: logo ? { icon: logo, shortcut: logo, apple: logo } : null,
    openGraph: {
      type: "website",
      locale: "ar_EG",
      url: "/",
      siteName: clinic.name,
      title: clinic.name,
      description,
      ...(logo && { images: [{ url: logo, alt: clinic.name }] }),
    },
    twitter: {
      card: "summary",
      title: clinic.name,
      description,
      ...(logo && { images: [logo] }),
    },
  };
}

function safeUrl(origin: string): URL | undefined {
  try {
    return new URL(origin);
  } catch {
    return undefined;
  }
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ar" dir="rtl" className={`${tajawal.variable} ${cairo.variable} ${amiri.variable}`}>
      <body
        suppressHydrationWarning
        className="flex min-h-screen max-w-[100vw] flex-col overflow-x-hidden font-sans text-text antialiased selection:bg-accent/30 selection:text-primary"
      >
        <TooltipProvider delayDuration={200}>
          <ConfirmProvider>{children}</ConfirmProvider>
        </TooltipProvider>
        <Toaster position="top-center" dir="rtl" richColors closeButton />
        <div className="noise-overlay" />
      </body>
    </html>
  );
}
