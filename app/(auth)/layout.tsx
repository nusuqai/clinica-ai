export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen flex" dir="rtl">
      {/* Left branding panel — hidden on mobile */}
      <div className="hidden lg:flex lg:w-1/2 bg-primary relative flex-col justify-between p-12 overflow-hidden">
        {/* Decorative blobs */}
        <div className="absolute top-[-80px] left-[-80px] w-72 h-72 rounded-full bg-accent/20 blur-[100px] pointer-events-none" />
        <div className="absolute bottom-[-60px] right-[-60px] w-96 h-96 rounded-full bg-accent/10 blur-[120px] pointer-events-none" />

        {/* Grid pattern overlay */}
        <div
          className="absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage:
              "linear-gradient(rgba(255,255,255,0.4) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.4) 1px, transparent 1px)",
            backgroundSize: "40px 40px",
          }}
        />

        {/* Logo */}
        <div className="relative z-10">
          <img
            src="/logo.png"
            alt="Clinica AI"
            className="h-14 w-auto object-contain brightness-0 invert"
          />
        </div>

        {/* Center content */}
        <div className="relative z-10 flex-1 flex flex-col justify-center gap-10">
          {/* Decorative medical icon */}
          <div className="w-20 h-20 rounded-2xl bg-accent/15 border border-accent/30 flex items-center justify-center">
            <svg
              className="w-10 h-10 text-accent"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 6v12m6-6H6"
              />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 22C6.477 22 2 17.523 2 12S6.477 2 12 2s10 4.477 10 10-4.477 10-10 10z"
              />
            </svg>
          </div>

          <div>
            <h2 className="text-4xl font-heading font-bold text-white leading-tight mb-4">
              رعاية صحية
              <br />
              <span className="text-accent">ذكية ومتكاملة</span>
            </h2>
            <p className="text-white/60 font-sans text-lg leading-relaxed max-w-sm">
              منصة Clinica AI تجمع بين الطب والذكاء الاصطناعي لتقديم تجربة رعاية
              صحية استثنائية.
            </p>
          </div>

          {/* Feature bullets */}
          <ul className="space-y-4">
            {[
              "حجز مواعيد فوري مع أفضل الأطباء",
              "متابعة صحية مستمرة بتقنية AI",
              "سجل طبي رقمي آمن وموثوق",
            ].map((item) => (
              <li
                key={item}
                className="flex items-center gap-3 text-white/70 font-sans"
              >
                <div className="w-5 h-5 rounded-full bg-accent/20 border border-accent/40 flex items-center justify-center flex-shrink-0">
                  <svg
                    className="w-3 h-3 text-accent"
                    viewBox="0 0 12 12"
                    fill="currentColor"
                  >
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
        </div>

        {/* Footer */}
        <p className="relative z-10 text-white/30 text-sm font-sans">
          © 2025 Clinica AI — جميع الحقوق محفوظة
        </p>
      </div>

      {/* Right form panel */}
      <div className="w-full lg:w-1/2 flex flex-col justify-center items-center bg-background relative overflow-hidden px-6 py-12">
        {/* Subtle top glow on mobile only */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-80 h-40 bg-accent/8 blur-[80px] pointer-events-none lg:hidden" />
        {children}
      </div>
    </div>
  );
}
