"use client";

import Link from "next/link";
import { Eye } from "lucide-react";
import type { AdminUser } from "@/server/services/users";
import type { Paginated } from "@/lib/pagination";
import { usersPageAction } from "@/server/actions/admin";
import { useLoadMore } from "@/hooks/use-load-more";
import { InfiniteScroll } from "@/components/ui/infinite-scroll";
import { RoleBadge } from "@/components/admin/status-badge";

// The clinic's members: the filters live in the URL (see FilterBar) so the
// server renders the matching first page; further pages load on scroll.
export default function UsersTable({
  initial,
  filters,
}: {
  initial: Paginated<AdminUser>;
  /** The filters `initial` was rendered with — later pages use the same. */
  filters: { query?: string; role?: string };
}) {
  const { items, hasMore, loading, error, loadMore } = useLoadMore(initial, (page) =>
    usersPageAction(filters, page)
  );

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card">
      <div className="overflow-x-auto">
        <table className="w-full font-sans text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/40">
              <th className="px-4 py-3 text-start font-medium text-muted-foreground">الاسم</th>
              <th className="px-4 py-3 text-start font-medium text-muted-foreground">
                البريد الإلكتروني
              </th>
              <th className="px-4 py-3 text-start font-medium text-muted-foreground">الهاتف</th>
              <th className="px-4 py-3 text-start font-medium text-muted-foreground">الدور</th>
              <th className="px-4 py-3 text-start font-medium text-muted-foreground">
                تاريخ التسجيل
              </th>
              <th className="px-4 py-3 text-end font-medium text-muted-foreground">الإجراءات</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {items.length === 0 && (
              <tr>
                <td colSpan={6} className="py-12 text-center text-muted-foreground">
                  لا يوجد مستخدمون
                </td>
              </tr>
            )}
            {items.map((user) => (
              <tr key={user.id} className="transition-colors hover:bg-muted/30">
                <td className="px-4 py-3 font-medium">
                  <Link
                    href={`/admin/users/${user.id}`}
                    className="text-foreground transition-colors hover:text-primary"
                  >
                    {user.fullName}
                  </Link>
                </td>
                <td className="px-4 py-3 text-muted-foreground" dir="ltr">
                  {user.email || "—"}
                </td>
                <td className="px-4 py-3 text-muted-foreground" dir="ltr">
                  {user.phone ?? "—"}
                </td>
                <td className="px-4 py-3">
                  <RoleBadge role={user.role} />
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  {new Date(user.createdAt).toLocaleDateString("ar-EG")}
                </td>
                <td className="px-4 py-3 text-end">
                  <Link
                    href={`/admin/users/${user.id}`}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 font-sans text-xs font-medium text-foreground transition-colors hover:bg-muted"
                  >
                    <Eye className="h-3.5 w-3.5" />
                    عرض التفاصيل
                  </Link>
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
