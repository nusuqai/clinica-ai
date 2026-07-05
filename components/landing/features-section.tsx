import { ShieldCheck, Zap, Clock3, Lock } from "lucide-react";

const FEATURES = [
  {
    icon: ShieldCheck,
    title: "أطباء موثوقون",
    description: "جميع الأطباء على المنصة معتمدون ومتحقق من بياناتهم المهنية.",
  },
  {
    icon: Zap,
    title: "تأكيد فوري",
    description: "احجز موعدك واحصل على تأكيد الحجز مباشرة دون انتظار.",
  },
  {
    icon: Clock3,
    title: "متاح على مدار الساعة",
    description: "احجز في أي وقت يناسبك، ليلاً أو نهاراً، دون الحاجة لمكالمة هاتفية.",
  },
  {
    icon: Lock,
    title: "بياناتك آمنة",
    description: "نتعامل مع بياناتك الطبية والشخصية بأعلى معايير الخصوصية والأمان.",
  },
];

export function FeaturesSection() {
  return (
    <section className="bg-white px-6 py-20">
      <div className="mx-auto max-w-7xl">
        <div className="mb-12 text-center">
          <h2 className="font-heading text-3xl font-extrabold text-primary lg:text-4xl">
            لماذا تختار ClinicaAI؟
          </h2>
          <p className="mt-3 font-sans text-base text-text/60">
            تجربة حجز طبية مصممة لراحتك وثقتك
          </p>
        </div>

        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map((feature) => {
            const Icon = feature.icon;
            return (
              <div
                key={feature.title}
                className="flex flex-col items-center rounded-2xl border border-border bg-background p-6 text-center transition-all hover:-translate-y-1 hover:shadow-md"
              >
                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-accent/10">
                  <Icon className="h-6 w-6 text-accent" />
                </div>
                <h3 className="font-heading text-base font-bold text-text">
                  {feature.title}
                </h3>
                <p className="mt-2 font-sans text-sm leading-relaxed text-text/60">
                  {feature.description}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
