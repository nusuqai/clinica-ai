import { UserSearch, CalendarCheck, Stethoscope } from "lucide-react";

const STEPS = [
  {
    icon: UserSearch,
    title: "اختر طبيبك",
    description: "تصفح قائمة الأطباء حسب التخصص واختر الأنسب لحالتك.",
  },
  {
    icon: CalendarCheck,
    title: "احجز موعدك",
    description: "اختر اليوم والوقت المتاح لدى الطبيب في ثوانٍ معدودة.",
  },
  {
    icon: Stethoscope,
    title: "احصل على الرعاية",
    description: "احضر في الموعد المحدد واستلم تأكيد الحجز فوراً.",
  },
];

export function HowItWorksSection() {
  return (
    <section className="bg-muted px-6 py-20">
      <div className="mx-auto max-w-7xl">
        <div className="mb-12 text-center">
          <h2 className="font-heading text-3xl font-extrabold text-primary lg:text-4xl">
            كيف تحجز موعدك؟
          </h2>
          <p className="mt-3 font-sans text-base text-text/60">
            ثلاث خطوات بسيطة تفصلك عن موعدك الطبي
          </p>
        </div>

        <div className="grid gap-8 sm:grid-cols-3">
          {STEPS.map((step, i) => {
            const Icon = step.icon;
            return (
              <div key={step.title} className="relative flex flex-col items-center text-center">
                <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary shadow-md shadow-primary/20">
                  <Icon className="h-7 w-7 text-accent" />
                </div>
                <div className="mb-2 font-heading text-sm font-bold text-accent">
                  {`٠${i + 1}`}
                </div>
                <h3 className="font-heading text-lg font-bold text-text">{step.title}</h3>
                <p className="mt-2 max-w-xs font-sans text-sm leading-relaxed text-text/60">
                  {step.description}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
