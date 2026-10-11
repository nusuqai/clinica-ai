"use client";

import Link from "next/link";
import { ExternalLink } from "lucide-react";
import type { DoctorWithProfile } from "@/server/services/doctors";
import type { Paginated } from "@/lib/pagination";
import { doctorsPageAction } from "@/server/actions/admin";
import { useLoadMore } from "@/hooks/use-load-more";
import { InfiniteScroll } from "@/components/ui/infinite-scroll";
import EditDoctorModal from "./edit-doctor-modal";
import DoctorRowActions from "./doctor-row-actions";
import type { BranchOption } from "./add-doctor-modal";
import type { SpecialtyOption } from "./specialty-select";

export interface DoctorTableFilters {
  query?: string;
  specialtyId?: string;
  branchId?: string;
  status?: string;
}

// The clinic's doctors: filtered in the database (filters live in the URL, see
// FilterBar); the first page is server-rendered, the rest load on scroll.
export default function DoctorsTable({
  initial,
  filters,
  branches,
  specialties,
}: {
  initial: Paginated<DoctorWithProfile>;
  /** The filters `initial` was rendered with — later pages use the same. */
  filters: DoctorTableFilters;
  branches: BranchOption[];
  specialties: SpecialtyOption[];
}) {
  const { items, hasMore, loading, error, loadMore } = useLoadMore(initial, (page) =>
    doctorsPageAction(filters, page)
  );
  const hasFilters = Object.values(filters).some(Boolean);

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card">
      <div className="overflow-x-auto">
        <table className="w-full font-sans text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/40">
              <th className="px-4 py-3 text-start font-medium text-muted-foreground">الاسم</th>
              <th className="px-4 py-3 text-start font-medium text-muted-foreground">التخصص</th>
              <th className="px-4 py-3 text-start font-medium text-muted-foreground">المواعيد</th>
              <th className="px-4 py-3 text-start font-medium text-muted-foreground">الحالة</th>
              <th className="px-4 py-3 text-start font-medium text-muted-foreground">إجراءات</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {items.length === 0 && (
              <tr>
                <td colSpan={8} className="py-12 text-center text-muted-foreground">
                  {hasFilters
                    ? "لا يوجد طبيب مطابق للفلاتر."
                    : "لا يوجد أطباء. أضف طبيباً جديداً لتبدأ."}
                </td>
              </tr>
            )}
            {items.map((doctor) => (
              <tr key={doctor.id} className="transition-colors hover:bg-muted/30">
                <td className="px-4 py-3 font-medium text-foreground">{doctor.profile.fullName}</td>
                <td className="px-4 py-3 text-muted-foreground">{doctor.specialty}</td>
                <td className="px-4 py-3 text-muted-foreground">{doctor._count.appointments}</td>
                <td className="px-4 py-3">
                  <span
                    className={[
                      "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
                      doctor.isActive
                        ? "bg-emerald-100 text-emerald-700"
                        : "bg-gray-100 text-gray-500",
                    ].join(" ")}
                  >
                    {doctor.isActive ? "نشط" : "غير نشط"}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1">
                    <Link
                      href={`/admin/doctors/${doctor.id}`}
                      title="عرض التفاصيل"
                      className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary"
                    >
                      <ExternalLink className="h-4 w-4" />
                    </Link>
                    <EditDoctorModal
                      doctor={doctor}
                      branches={branches}
                      specialties={specialties}
                    />
                    <DoctorRowActions doctorId={doctor.id} isActive={doctor.isActive} />
                  </div>
                </td>
              </tr>
            ))}
            <InfiniteScroll
              as="tr"
              onLoadMore={loadMore}
              hasMore={hasMore}
              loading={loading}
              error={error}
            />
          </tbody>
        </table>
      </div>
    </div>
  );
}
