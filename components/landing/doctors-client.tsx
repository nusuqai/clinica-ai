"use client";

import { useState } from "react";
import { Phone, DollarSign, Calendar } from "lucide-react";
import { BookAppointmentModal } from "./book-appointment-modal";

interface Doctor {
  id: string;
  specialty: string;
  consultationFee: number | null;
  isActive: boolean;
  profile: {
    fullName: string;
    phone: string | null;
  };
  _count: { appointments: number };
}

interface Props {
  doctors: Doctor[];
  isAuthenticated: boolean;
  isPatient: boolean;
}

const AVATAR_COLORS = [
  "bg-blue-600",
  "bg-violet-600",
  "bg-emerald-600",
  "bg-amber-600",
  "bg-rose-600",
  "bg-cyan-600",
  "bg-indigo-600",
  "bg-teal-600",
];

function getInitials(name: string) {
  return name
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0])
    .join("");
}

function getColor(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + hash * 31;
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

interface BookTarget {
  id: string;
  name: string;
  specialty: string;
  fee: number | null;
}

export function DoctorsClient({ doctors, isAuthenticated, isPatient }: Props) {
  const specialties = ["الكل", ...Array.from(new Set(doctors.map((d) => d.specialty)))];
  const [filter, setFilter] = useState("الكل");
  const [bookTarget, setBookTarget] = useState<BookTarget | null>(null);

  const filtered =
    filter === "الكل" ? doctors : doctors.filter((d) => d.specialty === filter);

  return (
    <div id="doctors" className="scroll-mt-20">
      {/* Section header */}
      <div className="mb-10 text-center">
        <h2 className="font-heading text-3xl font-extrabold text-primary lg:text-4xl">
          أطباؤنا المتخصصون
        </h2>
        <p className="mt-3 font-sans text-base text-text/60">
          نخبة من الأطباء المتخصصين في مختلف التخصصات الطبية
        </p>
      </div>

      {/* Specialty filter pills */}
      <div className="mb-8 flex flex-wrap justify-center gap-2">
        {specialties.map((spec) => (
          <button
            key={spec}
            onClick={() => setFilter(spec)}
            className={`rounded-full border px-4 py-1.5 font-sans text-sm font-medium transition-all ${
              filter === spec
                ? "border-accent bg-accent text-white shadow-md shadow-accent/20"
                : "border-border bg-white text-text/70 hover:border-accent/40 hover:text-accent"
            }`}
          >
            {spec}
          </button>
        ))}
      </div>

      {/* Empty state */}
      {filtered.length === 0 && (
        <div className="flex flex-col items-center gap-3 py-16 text-center">
          <p className="font-sans text-text/40">لا يوجد أطباء في هذا التخصص حالياً</p>
        </div>
      )}

      {/* Cards grid */}
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.map((doctor) => {
          const color = getColor(doctor.profile.fullName);
          const initials = getInitials(doctor.profile.fullName);
          return (
            <div
              key={doctor.id}
              className="group flex flex-col rounded-2xl border border-border bg-white p-6 shadow-sm transition-all hover:-translate-y-1 hover:shadow-md"
            >
              {/* Avatar + name */}
              <div className="flex items-center gap-4">
                <div
                  className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl ${color} font-heading text-lg font-bold text-white`}
                >
                  {initials}
                </div>
                <div className="min-w-0">
                  <p className="truncate font-heading text-base font-bold text-text">
                    د. {doctor.profile.fullName}
                  </p>
                  <p className="truncate font-sans text-sm text-accent">
                    {doctor.specialty}
                  </p>
                </div>
              </div>

              {/* Info rows */}
              <div className="mt-4 flex flex-col gap-2 border-t border-border pt-4">
                {doctor.consultationFee && (
                  <div className="flex items-center gap-2 text-text/60">
                    <DollarSign className="h-4 w-4 shrink-0 text-accent" />
                    <span className="font-sans text-sm">
                      رسوم الكشف:{" "}
                      <span className="font-medium text-text">
                        {doctor.consultationFee} جنيه
                      </span>
                    </span>
                  </div>
                )}
                {doctor.profile.phone && (
                  <div className="flex items-center gap-2 text-text/60">
                    <Phone className="h-4 w-4 shrink-0 text-accent" />
                    <span className="font-sans text-sm" dir="ltr">
                      {doctor.profile.phone}
                    </span>
                  </div>
                )}
                <div className="flex items-center gap-2 text-text/60">
                  <Calendar className="h-4 w-4 shrink-0 text-accent" />
                  <span className="font-sans text-sm">
                    {doctor._count.appointments} موعد مكتمل
                  </span>
                </div>
              </div>

              {/* Book button */}
              <button
                id={doctor.id === filtered[0]?.id ? "book" : undefined}
                onClick={() =>
                  setBookTarget({
                    id: doctor.id,
                    name: doctor.profile.fullName,
                    specialty: doctor.specialty,
                    fee: doctor.consultationFee,
                  })
                }
                className="mt-5 w-full rounded-xl bg-primary py-2.5 font-sans text-sm font-medium text-white transition-all group-hover:bg-accent"
              >
                احجز موعد
              </button>
            </div>
          );
        })}
      </div>

      {/* Booking modal */}
      {bookTarget && (
        <BookAppointmentModal
          doctor={bookTarget}
          isAuthenticated={isAuthenticated}
          isPatient={isPatient}
          onClose={() => setBookTarget(null)}
        />
      )}
    </div>
  );
}
