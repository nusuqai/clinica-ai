import Link from "next/link";
import {
  ArrowLeft,
  Bot,
  MessageCircle,
  CalendarCheck,
  BarChart3,
  Users2,
  ShieldCheck,
  Building2,
  Stethoscope,
} from "lucide-react";
import { RequestClinicForm } from "./request-clinic-form";

// ─── Hero ───────────────────────────────────────────────────────────────────

export function SaasHero({
  isAuthenticated,
  continueHref,
  clinicCount,
}: {
  isAuthenticated: boolean;
  continueHref: string;
  clinicCount: number;
}) {
  return (
    <section className="relative flex min-h-screen items-center overflow-hidden bg-primary" id="hero">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -right-32 -top-32 h-96 w-96 rounded-full bg-accent/10 blur-3xl" />
        <div className="absolute -bottom-32 -left-32 h-96 w-96 rounded-full bg-accent/5 blur-3xl" />
      </div>

      <div className="relative mx-auto max-w-7xl px-6 py-32 text-center">
        <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-accent/30 bg-accent/10 px-4 py-1.5">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent" />
          <span className="font-sans text-sm font-medium text-accent">
            منصة إدارة العيادات الذكية
          </span>
        </div>

        <h1 className="font-heading text-4xl font-extrabold leading-tight text-white sm:text-5xl lg:text-7xl">
          أدِر عيادتك
          <br />
          <span className="text-accent">بذكاء اصطناعي</span>
        </h1>

        <p className="mx-auto mt-6 max-w-2xl font-sans text-lg leading-relaxed text-white/60">
          ClinicaAI منصة متكاملة تمنح كل عيادة صفحتها الخاصة، وموظف استقبال ذكي، وحجزاً
          عبر واتساب، ولوحة تحكم لإدارة الأطباء والمواعيد والمرضى.
        </p>

        <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
          {isAuthenticated ? (
            <Link
              href={continueHref}
              className="group inline-flex items-center gap-2 rounded-xl bg-accent px-7 py-3.5 font-medium text-white shadow-lg shadow-accent/25 transition-all hover:-translate-y-0.5"
            >
              الانتقال إلى عيادتي
              <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-1" />
            </Link>
          ) : (
            <>
              <a
                href="#request"
                className="group inline-flex items-center gap-2 rounded-xl bg-accent px-7 py-3.5 font-medium text-white shadow-lg shadow-accent/25 transition-all hover:-translate-y-0.5"
              >
                أنشئ عيادتك الآن
                <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-1" />
              </a>
              <a
                href="#features"
                className="inline-flex items-center gap-2 rounded-xl border border-white/20 px-7 py-3.5 font-medium text-white transition-all hover:border-accent/50 hover:bg-white/5"
              >
                استكشف المميزات
              </a>
            </>
          )}
        </div>

        {clinicCount > 0 && (
          <p className="mt-10 font-sans text-sm text-white/40">
            موثوقة من {clinicCount}+ عيادة
          </p>
        )}
      </div>
    </section>
  );
}

// ─── How it works (for clinics) ───────────────────────────────────────────────

const STEPS = [
  {
    icon: Building2,
    title: "اطلب إنشاء عيادتك",
    description: "املأ نموذج بسيط، ويقوم فريقنا بإعداد عيادتك وصفحتها الخاصة.",
  },
  {
    icon: Users2,
    title: "أضف أطباءك وفريقك",
    description: "أضف الأطباء ومواعيدهم وأدر صلاحيات فريقك من لوحة التحكم.",
  },
  {
    icon: CalendarCheck,
    title: "استقبل الحجوزات",
    description: "يحجز مرضاك عبر صفحة العيادة وواتساب، ويتولّى المساعد الذكي الباقي.",
  },
];

export function SaasHowItWorks() {
  return (
    <section className="bg-muted px-6 py-20">
      <div className="mx-auto max-w-7xl">
        <div className="mb-12 text-center">
          <h2 className="font-heading text-3xl font-extrabold text-primary lg:text-4xl">
            كيف تعمل المنصة؟
          </h2>
          <p className="mt-3 font-sans text-base text-text/60">
            ثلاث خطوات لتشغيل عيادتك على ClinicaAI
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

// ─── Features ─────────────────────────────────────────────────────────────────

const FEATURES = [
  {
    icon: Bot,
    title: "موظف استقبال ذكي",
    description: "مساعد بالذكاء الاصطناعي يردّ على المرضى ويحجز المواعيد على مدار الساعة.",
  },
  {
    icon: MessageCircle,
    title: "حجز عبر واتساب",
    description: "تكامل مع واتساب الرسمي (Meta) ليحجز مرضاك من حيث يتحدثون بالفعل.",
  },
  {
    icon: CalendarCheck,
    title: "إدارة المواعيد",
    description: "جدولة الأطباء، إدارة الأوقات المتاحة، ومتابعة حالة كل موعد بسهولة.",
  },
  {
    icon: BarChart3,
    title: "تقارير ولوحة تحكم",
    description: "نظرة شاملة على أداء عيادتك: المواعيد، الأطباء، والمرضى.",
  },
  {
    icon: Building2,
    title: "صفحة خاصة لكل عيادة",
    description: "صفحة عامة بهوية عيادتك يحجز منها المرضى وينشئون حساباتهم فيها.",
  },
  {
    icon: ShieldCheck,
    title: "عزل وأمان البيانات",
    description: "بيانات كل عيادة معزولة تماماً، مع أعلى معايير الخصوصية والأمان.",
  },
];

export function SaasFeatures() {
  return (
    <section id="features" className="scroll-mt-20 bg-white px-6 py-20">
      <div className="mx-auto max-w-7xl">
        <div className="mb-12 text-center">
          <h2 className="font-heading text-3xl font-extrabold text-primary lg:text-4xl">
            كل ما تحتاجه عيادتك
          </h2>
          <p className="mt-3 font-sans text-base text-text/60">
            أدوات متكاملة لإدارة عيادة حديثة
          </p>
        </div>

        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((feature) => {
            const Icon = feature.icon;
            return (
              <div
                key={feature.title}
                className="flex flex-col rounded-2xl border border-border bg-background p-6 transition-all hover:-translate-y-1 hover:shadow-md"
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

// ─── Request CTA ───────────────────────────────────────────────────────────────

export function RequestClinicSection() {
  return (
    <section id="request" className="scroll-mt-20 bg-primary px-6 py-20">
      <div className="mx-auto max-w-3xl">
        <div className="mb-8 text-center">
          <h2 className="font-heading text-3xl font-extrabold text-white lg:text-4xl">
            جاهز لإطلاق عيادتك؟
          </h2>
          <p className="mt-3 font-sans text-base text-white/60">
            اترك بياناتك وسيتواصل معك فريقنا لإعداد عيادتك على ClinicaAI.
          </p>
        </div>
        <RequestClinicForm />
      </div>
    </section>
  );
}

// ─── Footer ────────────────────────────────────────────────────────────────────

export function MarketingFooter() {
  return (
    <footer className="bg-primary">
      <div className="mx-auto max-w-7xl px-6 py-12">
        <div className="flex flex-col items-center gap-6 text-center">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent">
              <Stethoscope className="h-5 w-5 text-white" />
            </div>
            <span className="font-heading text-xl font-bold text-white">ClinicaAI</span>
          </div>

          <p className="max-w-sm font-sans text-sm leading-relaxed text-white/50">
            منصة إدارة العيادات الذكية — أدِر عيادتك واستقبل حجوزاتك بذكاء اصطناعي
          </p>

          <div className="flex flex-wrap justify-center gap-6">
            <a href="#features" className="font-sans text-sm text-white/50 transition-colors hover:text-accent">
              المميزات
            </a>
            <a href="#request" className="font-sans text-sm text-white/50 transition-colors hover:text-accent">
              أنشئ عيادتك
            </a>
            <Link href="/login" className="font-sans text-sm text-white/50 transition-colors hover:text-accent">
              تسجيل الدخول
            </Link>
          </div>

          <div className="h-px w-full max-w-xs bg-white/10" />

          <p className="font-sans text-xs text-white/30">
            © {new Date().getFullYear()} ClinicaAI — جميع الحقوق محفوظة
          </p>
        </div>
      </div>
    </footer>
  );
}
