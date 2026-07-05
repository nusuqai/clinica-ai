import { ArrowLeft } from "lucide-react";

export function CTABannerSection() {
  return (
    <section className="bg-muted px-6 py-16">
      <div className="mx-auto flex max-w-5xl flex-col items-center gap-6 rounded-3xl bg-primary px-8 py-14 text-center">
        <h2 className="font-heading text-2xl font-extrabold text-white sm:text-3xl">
          جاهز لحجز موعدك؟
        </h2>
        <p className="max-w-xl font-sans text-base text-white/60">
          انضم إلى آلاف المرضى الذين يحجزون مواعيدهم الطبية بسهولة عبر
          ClinicaAI.
        </p>
        <a
          href="#doctors"
          className="group inline-flex items-center gap-2 rounded-xl bg-accent px-7 py-3.5 font-medium text-white shadow-lg shadow-accent/25 transition-all hover:-translate-y-0.5 hover:shadow-accent/40"
        >
          تصفح الأطباء الآن
          <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-1" />
        </a>
      </div>
    </section>
  );
}
