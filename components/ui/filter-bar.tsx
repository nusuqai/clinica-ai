"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Search, X } from "lucide-react";
import { useQueryParam } from "@/hooks/use-query-param";

// The filter controls above a paginated list. Every field lives in the URL, so
// the server renders the matching first page and infinite scroll continues
// with the same filters. Other params (e.g. ?tab=) are left untouched.

export type FilterField =
  | { type: "search"; param: string; placeholder: string }
  | {
      type: "select";
      param: string;
      /** Label of the empty "no filter" option. */
      allLabel: string;
      options: { value: string; label: string }[];
    }
  | { type: "date"; param: string };

const control =
  "rounded-xl border border-border bg-background px-3 py-2 font-sans text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30";

export function FilterBar({
  fields,
  className = "",
  stacked = false,
}: {
  fields: FilterField[];
  className?: string;
  /** Narrow containers (a sidebar): search on its own row, selects share the next. */
  stacked?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const active = fields.some((f) => searchParams.get(f.param));

  function clearAll() {
    const params = new URLSearchParams(searchParams.toString());
    for (const f of fields) params.delete(f.param);
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  return (
    <div className={`flex flex-wrap items-center gap-2 ${stacked ? "" : "mb-4"} ${className}`}>
      {fields.map((f) => (
        <Field key={f.param} field={f} stacked={stacked} />
      ))}
      {active && (
        <button
          type="button"
          onClick={clearAll}
          className={`inline-flex items-center gap-1 font-sans text-muted-foreground transition-colors hover:text-foreground ${
            stacked ? "text-xs" : "px-3 py-2 text-sm"
          }`}
        >
          <X className="h-4 w-4" />
          مسح الفلاتر
        </button>
      )}
    </div>
  );
}

function Field({ field, stacked }: { field: FilterField; stacked: boolean }) {
  // Typing is debounced; picking from a select or a date applies at once.
  const [value, setValue] = useQueryParam(field.param, field.type === "search" ? 300 : 0);

  if (field.type === "search") {
    return (
      <div className={stacked ? "relative w-full" : "relative"}>
        <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={field.placeholder}
          className={`${control} pr-9 ${stacked ? "w-full" : "w-56"}`}
        />
      </div>
    );
  }
  if (field.type === "select") {
    return (
      <select
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className={`${control} ${stacked ? "min-w-0 flex-1 px-2 text-xs" : ""}`}
      >
        <option value="">{field.allLabel}</option>
        {field.options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    );
  }
  return (
    <input
      type="date"
      value={value}
      onChange={(e) => setValue(e.target.value)}
      className={control}
    />
  );
}
