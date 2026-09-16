import Link from "next/link";
import { getHostClinic } from "@/lib/auth";

// One auth shell for every host: the branding panel carries the clinic when the
// request is for a clinic's subdomain, and the platform otherwise.
export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  const clinic = await getHostClinic();

  return (
    <div className="flex min-h-screen" dir="rtl">
      {/* Left branding panel — hidden on mobile */}
      <div className="relative hidden flex-col justify-between overflow-hidden bg-primary p-12 lg:flex lg:w-1/2">
        {/* Decorative blobs */}
        <div className="pointer-events-none absolute left-[-80px] top-[-80px] h-72 w-72 rounded-full bg-accent/20 blur-[100px]" />
        <div className="pointer-events-none absolute bottom-[-60px] right-[-60px] h-96 w-96 rounded-full bg-accent/10 blur-[120px]" />

        {/* Grid pattern overlay */}
        <div
          className="absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage:
              "linear-gradient(rgba(255,255,255,0.4) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.4) 1px, transparent 1px)",
            backgroundSize: "40px 40px",
          }}
        />

        {/* Brand */}
        {clinic ? (
          <Link href="/" className="relative z-10 flex items-center gap-3">
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
        ) : (
          <div className="relative z-10">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/logo.png"
              alt="Clinica AI"
              className="h-14 w-auto object-contain brightness-0 invert"
            />
          </div>
        )}

        {/* Center content */}
        <div className="relative z-10 flex flex-1 flex-col justify-center gap-10">
          {clinic ? (
            <div>
              <h2 className="mb-4 font-heading text-4xl font-bold leading-tight text-white">
                مرحباً بك في
                <br />
                <span className="text-accent">{clinic.name}</span>
              </h2>
              <p className="max-w-sm font-sans text-lg leading-relaxed text-white/60">
                سجّل دخولك أو أنشئ حسابك لحجز مواعيدك ومتابعة رعايتك الصحية مع {clinic.name}.
              </p>
            </div>
          ) : (
            <>
              {/* Decorative medical icon */}
              <div className="flex h-20 w-20 items-center justify-center rounded-2xl border border-accent/30 bg-accent/15">
                <svg
                  className="h-10 w-10 text-accent"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m6-6H6" />
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M12 22C6.477 22 2 17.523 2 12S6.477 2 12 2s10 4.477 10 10-4.477 10-10 10z"
                  />
                </svg>
              </div>

              <div>
                <h2 className="mb-4 font-heading text-4xl font-bold leading-tight text-white">
                  رعاية صحية
                  <br />
                  <span className="text-accent">ذكية ومتكاملة</span>
                </h2>
                <p className="max-w-sm font-sans text-lg leading-relaxed text-white/60">
                  منصة Clinica AI تجمع بين الطب والذكاء الاصطناعي لتقديم تجربة رعاية صحية استثنائية.
                </p>
              </div>

              {/* Feature bullets */}
              <ul className="space-y-4">
                {[
                  "حجز مواعيد فوري مع أفضل الأطباء",
                  "متابعة صحية مستمرة بتقنية AI",
                  "سجل طبي رقمي آمن وموثوق",
                ].map((item) => (
                  <li key={item} className="flex items-center gap-3 font-sans text-white/70">
                    <div className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full border border-accent/40 bg-accent/20">
                      <svg className="h-3 w-3 text-accent" viewBox="0 0 12 12" fill="currentColor">
                        <path
                          d="M10 3L5 8.5 2 5.5"
                          stroke="currentColor"
                          strokeWidth="1.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          fill="none"
                        />
                      </svg>
                    </div>
                    {item}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>

        {/* Footer */}
        <p className="relative z-10 font-sans text-sm text-white/30">
          {clinic ? "مدعوم من ClinicaAI" : "© 2025 Clinica AI — جميع الحقوق محفوظة"}
        </p>
      </div>

      {/* Right form panel */}
      <div className="relative flex w-full flex-col items-center justify-center overflow-hidden bg-background px-6 py-12 lg:w-1/2">
        {/* Subtle top glow on mobile only */}
        <div className="bg-accent/8 pointer-events-none absolute left-1/2 top-0 h-40 w-80 -translate-x-1/2 blur-[80px] lg:hidden" />
        {children}
      </div>
    </div>
  );
}
