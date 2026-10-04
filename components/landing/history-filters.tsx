"use client";

import { useEffect, useState } from "react";
import { Search, X } from "lucide-react";

// Filters for the patient's history panels (past visits, treatment record).
// Kept in local state — the URL would re-render the whole landing page — and
// applied in the database by the panel's server action (see useLoadMore's
// filterKey).

export interface HistoryFilterValue {
  doctorId?: string;
  /** "YYYY-MM-DD": only visits on that day. */
  date?: string;
  query?: string;
}

/**
 * Filter state for one panel. `query` is debounced so typing doesn't fire a
 * request per keystroke; `key` changes whenever the applied filters do.
 */
export function useHistoryFilters() {
  const [doctorId, setDoctorId] = useState("");
  const [date, setDate] = useState("");
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setQuery(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  const applied: HistoryFilterValue = {
    doctorId: doctorId || undefined,
    date: date || undefined,
    query: query || undefined,
  };
  return {
    applied,
    key: JSON.stringify(applied),
    active: Object.values(applied).some(Boolean),
    controls: { doctorId, setDoctorId, date, setDate, search, setSearch },
    clear() {
      setDoctorId("");
      setDate("");
      setSearch("");
      setQuery("");
    },
  };
}

const control =
  "rounded-xl border border-border bg-background px-3 py-2 font-sans text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30";

export function HistoryFilters({
  filters,
  doctors,
  searchPlaceholder,
}: {
  filters: ReturnType<typeof useHistoryFilters>;
  /** Doctors this patient has seen — the doctor select's options. */
  doctors: { id: string; name: string }[];
  /** Shows a text search when set (treatment record only). */
  searchPlaceholder?: string;
}) {
  const c = filters.controls;
  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      {searchPlaceholder && (
        <div className="relative">
          <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={c.search}
            onChange={(e) => c.setSearch(e.target.value)}
            placeholder={searchPlaceholder}
            className={`${control} w-60 pr-9`}
          />
        </div>
      )}
      {doctors.length > 1 && (
        <select
          value={c.doctorId}
          onChange={(e) => c.setDoctorId(e.target.value)}
          className={control}
        >
          <option value="">كل الأطباء</option>
          {doctors.map((d) => (
            <option key={d.id} value={d.id}>
              د. {d.name}
            </option>
          ))}
        </select>
      )}
      <input
        type="date"
        value={c.date}
        onChange={(e) => c.setDate(e.target.value)}
        aria-label="تاريخ الزيارة"
        title="تاريخ الزيارة"
        className={control}
      />
      {filters.active && (
        <button
          type="button"
          onClick={filters.clear}
          className="inline-flex items-center gap-1 px-2 py-2 font-sans text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <X className="h-4 w-4" />
          مسح
        </button>
      )}
    </div>
  );
}
