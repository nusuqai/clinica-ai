"use client";

import { useState } from "react";
import {
  Award,
  Baby,
  BadgeCheck,
  BriefcaseMedical,
  CalendarCheck,
  DollarSign,
  GraduationCap,
  MapPin,
  Stethoscope,
} from "lucide-react";
import type { SoloDoctor } from "@/server/services/clinic-kind";
import { doctorSubtitle } from "@/lib/doctor-title";
import { BookAppointmentModal } from "./book-appointment-modal";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { formatFee } from "@/lib/currency";

function initials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join("");
}

interface Props {
  /** The clinic's one active doctor; null while the admin hasn't added them yet. */
  doctor: SoloDoctor | null;
  isAuthenticated: boolean;
  isPatient: boolean;
  appointmentsHref?: string;
  loginHref: string;
  registerHref: string;
}

/**
 * Solo-doctor clinic: replaces the doctors grid + specialty filters with one
 * profile of the clinic's doctor and a direct booking button. Keeps the
 * `#doctors` / `#book` anchors the nav, hero and footer link to.
 */
export function SoloDoctorSection({
  doctor,
  isAuthenticated,
  isPatient,
  appointmentsHref,
  loginHref,
  registerHref,
}: Props) {
  const [booking, setBooking] = useState(false);

  if (!doctor) {
    return (
      <div id="doctors" className="scroll-mt-25">
        <div id="book" className="scroll-mt-25 py-16 text-center">
          <p className="font-sans text-text/50">الحجز غير متاح حالياً، يرجى المحاولة لاحقاً.</p>
        </div>
      </div>
    );
  }

  const subtitle = doctorSubtitle(doctor.title, doctor.specialty);
  const facts = [
    doctor.yearsOfExperience != null && {
      icon: Award,
      label: "سنوات الخبرة",
      value: `${doctor.yearsOfExperience} سنة`,
    },
    doctor.examinationFee != null && {
      icon: DollarSign,
      label: "سعر الكشف",
      value: formatFee(doctor.examinationFee),
    },
    doctor.consultationFee != null && {
      icon: DollarSign,
      label: "سعر الاستشارة",
      value: formatFee(doctor.consultationFee),
    },
    {
      icon: Baby,
      label: "الكشف على الأطفال",
      value: doctor.acceptsChildren ? "متاح" : "غير متاح",
    },
    {
      icon: CalendarCheck,
      label: "نظام الحجز",
      value: doctor.requiresAdvanceBooking ? "بحجز مسبق" : "بدون حجز مسبق",
    },
  ].filter(Boolean) as { icon: typeof Award; label: string; value: string }[];

  const details = [
    { icon: GraduationCap, title: "المؤهلات العلمية", text: doctor.qualifications },
    { icon: BriefcaseMedical, title: "مجالات الخبرة", text: doctor.expertiseAreas },
  ].filter((d) => d.text?.trim());

  return (
    <div id="doctors" className="scroll-mt-25">
      <div id="book" className="scroll-mt-25">
        <div className="mb-10 text-center">
          <h2 className="font-heading text-3xl font-extrabold text-primary lg:text-4xl">
            تعرّف على طبيبك
          </h2>
          <p className="mt-3 font-sans text-base text-text/60">كل ما تحتاج معرفته قبل حجز موعدك</p>
        </div>

        <div className="mx-auto grid max-w-5xl gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
          {/* Profile card + booking */}
          <div className="flex flex-col rounded-2xl border border-border bg-white p-6 shadow-sm">
            <div className="flex items-center gap-4">
              <Avatar className="h-16 w-16 rounded-2xl">
                <AvatarFallback className="rounded-2xl bg-primary font-heading text-xl font-bold text-white">
                  {initials(doctor.fullName)}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <p className="font-heading text-lg font-bold text-text">د. {doctor.fullName}</p>
                {subtitle && <p className="font-sans text-sm text-accent">{subtitle}</p>}
              </div>
            </div>

            <dl className="mt-5 flex flex-col gap-2.5 border-t border-border pt-5">
              {facts.map((f) => {
                const Icon = f.icon;
                return (
                  <div key={f.label} className="flex items-center gap-2 text-text/60">
                    <Icon className="h-4 w-4 shrink-0 text-accent" />
                    <dt className="font-sans text-sm">{f.label}:</dt>
                    <dd className="font-sans text-sm font-medium text-text">{f.value}</dd>
                  </div>
                );
              })}
            </dl>

            {doctor.branches.length > 0 && (
              <div className="mt-4 flex flex-col gap-2 border-t border-border pt-4">
                {doctor.branches.map((b) => (
                  <div key={b.id} className="flex items-start gap-2 text-text/60">
                    <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
                    <span className="font-sans text-sm">
                      <span className="font-medium text-text">{b.name}</span>
                      {b.address && ` — ${b.address}`}
                    </span>
                  </div>
                ))}
              </div>
            )}

            <Button onClick={() => setBooking(true)} className="mt-6 w-full hover:bg-accent">
              احجز موعد
            </Button>
          </div>

          {/* About */}
          <div className="flex flex-col gap-4">
            <div className="rounded-2xl border border-border bg-white p-6 shadow-sm">
              <div className="mb-3 flex items-center gap-2">
                <Stethoscope className="h-5 w-5 text-accent" />
                <h3 className="font-heading text-base font-bold text-text">نبذة عن الطبيب</h3>
              </div>
              <p className="whitespace-pre-line font-sans text-sm leading-relaxed text-text/70">
                {doctor.bio?.trim() ||
                  `د. ${doctor.fullName}${subtitle ? ` — ${subtitle}` : ""}. احجز موعدك بسهولة واختر اليوم المناسب لك.`}
              </p>
            </div>
            {details.map((d) => {
              const Icon = d.icon;
              return (
                <div
                  key={d.title}
                  className="rounded-2xl border border-border bg-white p-6 shadow-sm"
                >
                  <div className="mb-3 flex items-center gap-2">
                    <Icon className="h-5 w-5 text-accent" />
                    <h3 className="font-heading text-base font-bold text-text">{d.title}</h3>
                  </div>
                  <p className="whitespace-pre-line font-sans text-sm leading-relaxed text-text/70">
                    {d.text}
                  </p>
                </div>
              );
            })}
            {details.length === 0 && (
              <div className="flex items-center gap-2 rounded-2xl border border-border bg-white p-6 text-text/60 shadow-sm">
                <BadgeCheck className="h-5 w-5 shrink-0 text-accent" />
                <span className="font-sans text-sm">
                  حجز إلكتروني على مدار الساعة وتأكيد فوري لموعدك.
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      {booking && (
        <BookAppointmentModal
          doctor={{
            id: doctor.id,
            name: doctor.fullName,
            specialty: subtitle ?? "",
            fee: doctor.examinationFee ?? doctor.consultationFee,
          }}
          isAuthenticated={isAuthenticated}
          isPatient={isPatient}
          appointmentsHref={appointmentsHref}
          loginHref={loginHref}
          registerHref={registerHref}
          onClose={() => setBooking(false)}
        />
      )}
    </div>
  );
}
