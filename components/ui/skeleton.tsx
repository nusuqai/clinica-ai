import type * as React from "react";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";

export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("animate-pulse rounded-md bg-muted", className)}
      aria-hidden="true"
      {...props}
    />
  );
}

export function PageHeaderSkeleton({ withAction = false }: { withAction?: boolean }) {
  return (
    <div className="mb-6 flex items-start justify-between gap-4">
      <div className="space-y-2">
        <Skeleton className="h-7 w-40" />
        <Skeleton className="h-4 w-56" />
      </div>
      {withAction && <Skeleton className="h-10 w-32 flex-shrink-0 rounded-xl" />}
    </div>
  );
}

export function StatCardSkeleton() {
  return (
    <Card className="flex items-center gap-4 p-5">
      <Skeleton className="h-12 w-12 flex-shrink-0 rounded-xl" />
      <div className="flex-1 space-y-2">
        <Skeleton className="h-6 w-10" />
        <Skeleton className="h-3 w-20" />
      </div>
    </Card>
  );
}

export function StatCardGridSkeleton({
  count = 4,
  columns = "grid-cols-2 lg:grid-cols-4",
}: {
  count?: number;
  columns?: string;
}) {
  return (
    <div className={`grid ${columns} mb-8 gap-4`}>
      {Array.from({ length: count }).map((_, i) => (
        <StatCardSkeleton key={i} />
      ))}
    </div>
  );
}

export function TableSkeleton({ columns = 5, rows = 6 }: { columns?: number; rows?: number }) {
  return (
    <Card className="overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full font-sans text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/40">
              {Array.from({ length: columns }).map((_, i) => (
                <th key={i} className="px-4 py-3">
                  <Skeleton className="h-3 w-16" />
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {Array.from({ length: rows }).map((_, r) => (
              <tr key={r}>
                {Array.from({ length: columns }).map((_, c) => (
                  <td key={c} className="px-4 py-3">
                    <Skeleton className="h-4 w-full max-w-[120px]" />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

export function ListCardSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <Card className="overflow-hidden">
      <div className="border-b border-border px-6 py-4">
        <Skeleton className="h-4 w-32" />
      </div>
      <ul className="divide-y divide-border">
        {Array.from({ length: rows }).map((_, i) => (
          <li key={i} className="flex items-center justify-between gap-4 px-6 py-4">
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <Skeleton className="h-10 w-10 flex-shrink-0 rounded-xl" />
              <div className="max-w-[200px] flex-1 space-y-2">
                <Skeleton className="h-3.5 w-3/4" />
                <Skeleton className="h-3 w-1/2" />
              </div>
            </div>
            <Skeleton className="h-5 w-16 flex-shrink-0 rounded-full" />
          </li>
        ))}
      </ul>
    </Card>
  );
}

export function CardGridSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: count }).map((_, i) => (
        <Card key={i} className="space-y-3 p-5">
          <Skeleton className="h-12 w-12 rounded-xl" />
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-3 w-1/2" />
        </Card>
      ))}
    </div>
  );
}

/** The admin appointments kanban: five status columns of cards. */
export function BoardSkeleton() {
  return (
    <div className="flex gap-4 overflow-x-auto pb-2">
      {Array.from({ length: 5 }).map((_, col) => (
        <div key={col} className="flex w-72 flex-shrink-0 flex-col">
          <Skeleton className="h-9 w-full rounded-b-none rounded-t-xl" />
          <div className="flex min-h-[280px] flex-col gap-2 rounded-b-xl border border-t-0 border-border bg-muted/20 p-2">
            {Array.from({ length: 2 }).map((_, card) => (
              <Skeleton key={card} className="h-24 w-full rounded-xl" />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/** A vertical list of full-width cards (title line + a row of details). */
export function StackedCardSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="space-y-4">
      {Array.from({ length: count }).map((_, i) => (
        <Card key={i} className="space-y-4 p-5">
          <div className="flex items-center justify-between gap-3">
            <div className="space-y-2">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-3 w-28" />
            </div>
            <Skeleton className="h-8 w-24 rounded-xl" />
          </div>
          <Skeleton className="h-3 w-full max-w-md" />
        </Card>
      ))}
    </div>
  );
}

/** Back link + title, then the details card and the record section of AppointmentDetail. */
export function AppointmentDetailSkeleton() {
  return (
    <div className="mx-auto max-w-3xl space-y-5 pb-12">
      <div className="space-y-3">
        <Skeleton className="h-4 w-28" />
        <div className="flex items-center justify-between gap-3">
          <Skeleton className="h-7 w-40" />
          <Skeleton className="h-5 w-20 rounded-full" />
        </div>
      </div>
      <Card className="overflow-hidden">
        <div className="border-b border-border bg-muted/30 px-5 py-4">
          <Skeleton className="h-4 w-32" />
        </div>
        <div className="divide-y divide-border">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-start gap-3 px-5 py-3">
              <Skeleton className="h-4 w-4 flex-shrink-0" />
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-3 w-16" />
                <Skeleton className="h-4 w-48" />
              </div>
            </div>
          ))}
        </div>
      </Card>
      <Skeleton className="h-6 w-48" />
      <Skeleton className="h-40 w-full rounded-2xl" />
    </div>
  );
}

/** The patient-facing pages' frame: the primary-colored clinic bar above `children`. */
export function ClinicPageShellSkeleton({
  tall = false,
  children,
}: {
  /** The profile page's deeper band, which the first card overlaps. */
  tall?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-muted/40">
      <div className={cn("bg-primary px-6", tall ? "pb-24 pt-6" : "py-6")}>
        <div
          className={cn(
            "mx-auto flex items-center justify-between",
            tall ? "max-w-4xl" : "max-w-3xl"
          )}
        >
          <Skeleton className="h-8 w-36 bg-white/20" />
          <Skeleton className="h-8 w-24 rounded-lg bg-white/20" />
        </div>
      </div>
      {children}
    </div>
  );
}

export function FormCardSkeleton({ fields = 4 }: { fields?: number }) {
  return (
    <Card className="space-y-5 p-6">
      {Array.from({ length: fields }).map((_, i) => (
        <div key={i} className="space-y-1.5">
          <Skeleton className="h-3.5 w-24" />
          <Skeleton className="h-11 w-full rounded-xl" />
        </div>
      ))}
      <Skeleton className="h-11 w-32 rounded-xl" />
    </Card>
  );
}
