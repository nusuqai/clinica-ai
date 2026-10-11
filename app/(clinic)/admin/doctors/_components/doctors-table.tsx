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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Hint } from "@/components/ui/tooltip";

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
    <Card className="overflow-hidden">
      <div className="overflow-x-auto">
        <Table className="w-full font-sans text-sm">
          <TableHeader>
            <TableRow className="border-b border-border bg-muted/40">
              <TableHead className="px-4 py-3 text-start font-medium text-muted-foreground">
                الاسم
              </TableHead>
              <TableHead className="px-4 py-3 text-start font-medium text-muted-foreground">
                التخصص
              </TableHead>
              <TableHead className="px-4 py-3 text-start font-medium text-muted-foreground">
                المواعيد
              </TableHead>
              <TableHead className="px-4 py-3 text-start font-medium text-muted-foreground">
                الحالة
              </TableHead>
              <TableHead className="px-4 py-3 text-start font-medium text-muted-foreground">
                إجراءات
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody className="divide-y divide-border">
            {items.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="py-12 text-center text-muted-foreground">
                  {hasFilters
                    ? "لا يوجد طبيب مطابق للفلاتر."
                    : "لا يوجد أطباء. أضف طبيباً جديداً لتبدأ."}
                </TableCell>
              </TableRow>
            )}
            {items.map((doctor) => (
              <TableRow key={doctor.id} className="transition-colors hover:bg-muted/30">
                <TableCell className="px-4 py-3 font-medium text-foreground">
                  {doctor.profile.fullName}
                </TableCell>
                <TableCell className="px-4 py-3 text-muted-foreground">
                  {doctor.specialty}
                </TableCell>
                <TableCell className="px-4 py-3 text-muted-foreground">
                  {doctor._count.appointments}
                </TableCell>
                <TableCell className="px-4 py-3">
                  <Badge variant={doctor.isActive ? "success" : "neutral"}>
                    {doctor.isActive ? "نشط" : "غير نشط"}
                  </Badge>
                </TableCell>
                <TableCell className="px-4 py-3">
                  <div className="flex items-center gap-1">
                    <Hint label="عرض التفاصيل">
                      <Link
                        aria-label="عرض التفاصيل"
                        href={`/admin/doctors/${doctor.id}`}
                        className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary"
                      >
                        <ExternalLink className="h-4 w-4" />
                      </Link>
                    </Hint>
                    <EditDoctorModal
                      doctor={doctor}
                      branches={branches}
                      specialties={specialties}
                    />
                    <DoctorRowActions doctorId={doctor.id} isActive={doctor.isActive} />
                  </div>
                </TableCell>
              </TableRow>
            ))}
            <InfiniteScroll
              as="tr"
              onLoadMore={loadMore}
              hasMore={hasMore}
              loading={loading}
              error={error}
            />
          </TableBody>
        </Table>
      </div>
    </Card>
  );
}
