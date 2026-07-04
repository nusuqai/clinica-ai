"use client";

import { useEffect, useRef } from "react";
import { Calendar, Users, CheckCircle, ArrowLeft } from "lucide-react";

interface HeroSectionProps {
  doctorCount: number;
  appointmentCount: number;
  isAuthenticated: boolean;
}

export function HeroSection({
  doctorCount,
  appointmentCount,
  isAuthenticated,
}: HeroSectionProps) {
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    const el = headingRef.current;
    if (!el) return;
    el.style.opacity = "0";
    el.style.transform = "translateY(24px)";
    requestAnimationFrame(() => {
      el.style.transition = "opacity 0.7s ease, transform 0.7s ease";
      el.style.opacity = "1";
      el.style.transform = "translateY(0)";
    });
  }, []);

  return (
    <section
      className="relative flex min-h-screen items-center overflow-hidden bg-primary"
      id="hero"
    >
      {/* Background decoration */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -right-32 -top-32 h-96 w-96 rounded-full bg-accent/10 blur-3xl" />
        <div className="absolute -bottom-32 -left-32 h-96 w-96 rounded-full bg-accent/5 blur-3xl" />
        <div className="absolute left-1/2 top-1/2 h-[600px] w-[600px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-accent/5" />
        <div className="absolute left-1/2 top-1/2 h-[400px] w-[400px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-accent/5" />
      </div>

      <div className="relative mx-auto max-w-7xl px-6 py-32 text-center">
        {/* Badge */}
        <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-accent/30 bg-accent/10 px-4 py-1.5">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent" />
          <span className="font-sans text-sm font-medium text-accent">
            منصة العيادة الذكية
          </span>
        </div>

        {/* Main heading */}
        <h1
          ref={headingRef}
          className="font-heading text-4xl font-extrabold leading-tight text-white sm:text-5xl lg:text-7xl"
        >
          احجز موعدك مع
          <br />
          <span className="text-accent">أفضل الأطباء</span>
        </h1>

        {/* Subheading */}
        <p className="mx-auto mt-6 max-w-2xl font-sans text-lg leading-relaxed text-white/60">
          ClinicaAI تجمعك بأطباء متخصصين في مختلف التخصصات. احجز موعدك في ثوانٍ
          واستمتع بتجربة رعاية صحية متطورة.
        </p>

        {/* CTA buttons */}
        <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
          <a
            href="#book"
            className="group inline-flex items-center gap-2 rounded-xl bg-accent px-7 py-3.5 font-medium text-white shadow-lg shadow-accent/25 transition-all hover:-translate-y-0.5 hover:shadow-accent/40"
          >
            احجز موعدك الآن
            <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-1" />
          </a>
          <a
            href="#doctors"
            className="inline-flex items-center gap-2 rounded-xl border border-white/20 px-7 py-3.5 font-medium text-white transition-all hover:border-accent/50 hover:bg-white/5"
          >
            تصفح الأطباء
          </a>
        </div>

        {/* Stats */}
        <div className="mx-auto mt-16 grid max-w-2xl grid-cols-3 gap-6">
          <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-5 backdrop-blur-sm">
            <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-xl bg-accent/20">
              <Users className="h-5 w-5 text-accent" />
            </div>
            <div className="font-heading text-2xl font-bold text-white">
              {doctorCount}+
            </div>
            <div className="mt-0.5 font-sans text-xs text-white/50">طبيب متخصص</div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-5 backdrop-blur-sm">
            <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-xl bg-accent/20">
              <CheckCircle className="h-5 w-5 text-accent" />
            </div>
            <div className="font-heading text-2xl font-bold text-white">
              {appointmentCount}+
            </div>
            <div className="mt-0.5 font-sans text-xs text-white/50">موعد مكتمل</div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-5 backdrop-blur-sm">
            <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-xl bg-accent/20">
              <Calendar className="h-5 w-5 text-accent" />
            </div>
            <div className="font-heading text-2xl font-bold text-white">24/7</div>
            <div className="mt-0.5 font-sans text-xs text-white/50">حجز إلكتروني</div>
          </div>
        </div>
      </div>

      {/* Scroll hint */}
      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 animate-bounce">
        <div className="flex h-9 w-5 items-start justify-center rounded-full border-2 border-white/20 p-1">
          <div className="h-2 w-1 animate-pulse rounded-full bg-accent" />
        </div>
      </div>
    </section>
  );
}
