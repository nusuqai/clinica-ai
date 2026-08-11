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
    <div className="min-h-screen flex" dir="rtl">
      {/* Branding panel */}
      <div className="hidden lg:flex lg:w-1/2 bg-primary relative flex-col justify-between p-12 overflow-hidden">
        <div className="absolute top-[-80px] left-[-80px] w-72 h-72 rounded-full bg-accent/20 blur-[100px] pointer-events-none" />
        <div className="absolute bottom-[-60px] right-[-60px] w-96 h-96 rounded-full bg-accent/10 blur-[120px] pointer-events-none" />

        <Link href={`/clinic/${slug}`} className="relative z-10 flex items-center gap-3">
          {clinic.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={clinic.logoUrl}
              alt={clinic.name}
              className="h-12 w-12 rounded-xl object-cover"
            />
          ) : null}
          <span className="font-heading text-2xl font-bold text-white">
            {clinic.name}
          </span>
        </Link>

        <div className="relative z-10 flex-1 flex flex-col justify-center">
          <h2 className="text-4xl font-heading font-bold text-white leading-tight mb-4">
            مرحباً بك في
            <br />
            <span className="text-accent">{clinic.name}</span>
          </h2>
          <p className="text-white/60 font-sans text-lg leading-relaxed max-w-sm">
            سجّل دخولك أو أنشئ حسابك لحجز مواعيدك ومتابعة رعايتك الصحية مع {clinic.name}.
          </p>
        </div>

        <p className="relative z-10 text-white/30 text-sm font-sans">
          مدعوم من ClinicaAI
        </p>
      </div>

      {/* Form panel */}
      <div className="w-full lg:w-1/2 flex flex-col justify-center items-center bg-background relative overflow-hidden px-6 py-12">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-80 h-40 bg-accent/8 blur-[80px] pointer-events-none lg:hidden" />
        {children}
      </div>
    </div>
  );
}
