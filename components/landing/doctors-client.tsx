"use client";

import { useEffect, useState } from "react";
import { Phone, DollarSign, Calendar, Search } from "lucide-react";
import type { Paginated } from "@/lib/pagination";
import { publicDoctorsPageAction } from "@/server/actions/patient";
import { useLoadMore } from "@/hooks/use-load-more";
import { InfiniteScroll } from "@/components/ui/infinite-scroll";
import { BookAppointmentModal } from "./book-appointment-modal";

export type PublicDoctor = Awaited<ReturnType<typeof publicDoctorsPageAction>>["items"][number];

interface Props {
  /** First page of the clinic's active doctors (no filters). */
  initial: Paginated<PublicDoctor>;
  /** Specialties that have active doctors — the filter pills. */
  specialties: { id: string; name: string }[];
  isAuthenticated: boolean;
  isPatient: boolean;
  /** Patient's appointments URL, threaded to the booking modal's success link. */
  appointmentsHref?: string;
  /** Auth links for the booking modal's "sign in to continue" state. */
  loginHref?: string;
  registerHref?: string;
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

export function DoctorsClient({
  initial,
  specialties,
  isAuthenticated,
  isPatient,
  appointmentsHref,
  loginHref,
  registerHref,
}: Props) {
  const [bookTarget, setBookTarget] = useState<BookTarget | null>(null);

  // Filters are local state (not the URL — that would re-render the whole
  // landing page); the database applies them and pages the result.
  const [specialtyId, setSpecialtyId] = useState("");
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setQuery(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  const filters = { query: query || undefined, specialtyId: specialtyId || undefined };
  const {
    items: doctors,
    hasMore,
    loading,
    error,
    loadMore,
  } = useLoadMore(
    initial,
    (page) => publicDoctorsPageAction(filters, page),
    JSON.stringify(filters)
  );
  const pills = [{ id: "", name: "الكل" }, ...specialties];

  return (
    <div id="doctors" className="scroll-mt-25">
      {/* Booking starts here: pick a specialty, then a doctor. Every "احجز
          موعد" link on the page (#book) lands on this block — heading
          included, always present even with no doctors or a filter active,
          and offset so the fixed nav doesn't cover it. */}
      <div id="book" className="scroll-mt-25">
        {/* Section header */}
        <div className="mb-10 text-center">
          <h2 className="font-heading text-3xl font-extrabold text-primary lg:text-4xl">
            أطباؤنا المتخصصون
          </h2>
          <p className="mt-3 font-sans text-base text-text/60">اختر التخصص ثم الطبيب لحجز موعدك</p>
        </div>

        {/* Name search + specialty pills — applied in the database */}
        <div className="mx-auto mb-4 max-w-sm">
          <div className="relative">
            <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text/40" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="ابحث باسم الطبيب..."
              className="w-full rounded-full border border-border bg-white py-2.5 pl-4 pr-10 font-sans text-sm text-text placeholder:text-text/40 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
            />
          </div>
        </div>
        <div className="mb-8 flex flex-wrap justify-center gap-2">
          {pills.map((spec) => (
            <button
              key={spec.id}
              onClick={() => setSpecialtyId(spec.id)}
              className={`inline-flex min-h-[40px] items-center rounded-full border px-4 py-2 font-sans text-sm font-medium transition-all ${
                specialtyId === spec.id
                  ? "border-accent bg-accent text-white shadow-md shadow-accent/20"
                  : "border-border bg-white text-text/70 hover:border-accent/40 hover:text-accent"
              }`}
            >
              {spec.name}
            </button>
          ))}
        </div>

        {/* Empty state */}
        {doctors.length === 0 && !loading && (
          <div className="flex flex-col items-center gap-3 py-16 text-center">
            <p className="font-sans text-text/40">
              {query ? "لا يوجد طبيب بهذا الاسم" : "لا يوجد أطباء في هذا التخصص حالياً"}
            </p>
          </div>
        )}

        {/* Cards grid */}
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {doctors.map((doctor) => {
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
                    <p className="truncate font-sans text-sm text-accent">{doctor.specialty}</p>
                  </div>
                </div>

                {/* Info rows */}
                <div className="mt-4 flex flex-col gap-2 border-t border-border pt-4">
                  {doctor.consultationFee && (
                    <div className="flex items-center gap-2 text-text/60">
                      <DollarSign className="h-4 w-4 shrink-0 text-accent" />
                      <span className="font-sans text-sm">
                        رسوم الكشف:{" "}
                        <span className="font-medium text-text">{doctor.consultationFee} جنيه</span>
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
        <InfiniteScroll onLoadMore={loadMore} hasMore={hasMore} loading={loading} error={error} />
      </div>

      {/* Booking modal */}
      {bookTarget && (
        <BookAppointmentModal
          doctor={bookTarget}
          isAuthenticated={isAuthenticated}
          isPatient={isPatient}
          appointmentsHref={appointmentsHref}
          loginHref={loginHref}
          registerHref={registerHref}
          onClose={() => setBookTarget(null)}
        />
      )}
    </div>
  );
}
