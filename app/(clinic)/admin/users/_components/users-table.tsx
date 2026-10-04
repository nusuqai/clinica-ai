"use client";

import Link from "next/link";
import { Eye, Search } from "lucide-react";
import type { AdminUser } from "@/server/services/users";
import type { Paginated } from "@/lib/pagination";
import { usersPageAction } from "@/server/actions/admin";
import { useLoadMore } from "@/hooks/use-load-more";
import { useQueryParam } from "@/hooks/use-query-param";
import { InfiniteScroll } from "@/components/ui/infinite-scroll";
import { RoleBadge } from "@/components/admin/status-badge";

// The clinic's members: search lives in the URL (?q=) so the server renders
// the matching first page; further pages load as the admin scrolls.
export default function UsersTable({
  initial,
  query,
}: {
  initial: Paginated<AdminUser>;
  query: string;
}) {
  const [search, setSearch] = useQueryParam("q", 300);
  const { items, hasMore, loading, error, loadMore } = useLoadMore(initial, (page) =>
    usersPageAction(query, page)
  );

  return (
    <>
      <div className="relative mb-4 w-full max-w-xs">
        <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="بحث بالاسم أو رقم الهاتف..."
          className="w-full rounded-xl border border-border bg-background py-2 pl-3 pr-9 font-sans text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
        />
      </div>

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
    </>
  );
}
