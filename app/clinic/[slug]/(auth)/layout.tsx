import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";

// Per-clinic auth shell: same split-panel look as the global auth layout, but
// branded with the clinic and linking back to the clinic's landing page.
export default async function ClinicAuthLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const clinic = await prisma.clinic.findFirst({
    where: { slug, isActive: true },
    select: { name: true, logoUrl: true },
  });
  if (!clinic) notFound();

  return (
    <div className="flex min-h-screen" dir="rtl">
      {/* Branding panel */}
      <div className="relative hidden flex-col justify-between overflow-hidden bg-primary p-12 lg:flex lg:w-1/2">
        <div className="pointer-events-none absolute left-[-80px] top-[-80px] h-72 w-72 rounded-full bg-accent/20 blur-[100px]" />
        <div className="pointer-events-none absolute bottom-[-60px] right-[-60px] h-96 w-96 rounded-full bg-accent/10 blur-[120px]" />

        <Link href={`/`} className="relative z-10 flex items-center gap-3">
          {clinic.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={clinic.logoUrl}
              alt={clinic.name}
              className="h-12 w-12 rounded-xl object-cover"
            />
          ) : null}
          <span className="font-heading text-2xl font-bold text-white">{clinic.name}</span>
        </Link>

        <div className="relative z-10 flex flex-1 flex-col justify-center">
          <h2 className="mb-4 font-heading text-4xl font-bold leading-tight text-white">
            مرحباً بك في
            <br />
            <span className="text-accent">{clinic.name}</span>
          </h2>
          <p className="max-w-sm font-sans text-lg leading-relaxed text-white/60">
            سجّل دخولك أو أنشئ حسابك لحجز مواعيدك ومتابعة رعايتك الصحية مع {clinic.name}.
          </p>
        </div>

        <p className="relative z-10 font-sans text-sm text-white/30">مدعوم من ClinicaAI</p>
      </div>

      {/* Form panel */}
      <div className="relative flex w-full flex-col items-center justify-center overflow-hidden bg-background px-6 py-12 lg:w-1/2">
        <div className="bg-accent/8 pointer-events-none absolute left-1/2 top-0 h-40 w-80 -translate-x-1/2 blur-[80px] lg:hidden" />
        {children}
      </div>
    </div>
  );
}
