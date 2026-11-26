import Link from "next/link";
import { Search } from "lucide-react";
import type { OperationStatus } from "@prisma/client";
import { requirePermission } from "@/lib/auth";
import PageHeader from "@/components/admin/page-header";
import { Input } from "@/components/ui/input";
import OperationsTable from "@/components/operations/operations-table";
import NewOperationButton from "@/components/operations/new-operation-button";
import {
  OPEN_OPERATION_STATUSES,
  OPERATION_STATUSES,
  OPERATION_STATUS_LABEL,
} from "@/lib/operations";
import {
  countOperationsByStatus,
  listOperations,
  operationFormOptions,
} from "@/server/services/operations";

interface PageProps {
  searchParams: Promise<{ tab?: string; q?: string }>;
}

type Tab = "open" | "all" | OperationStatus;

function isTab(v: string | undefined): v is Tab {
  return v === "open" || v === "all" || OPERATION_STATUSES.includes(v as OperationStatus);
}

export default async function AdminOperationsPage({ searchParams }: PageProps) {
  const ctx = await requirePermission("operations");
  const { tab: rawTab, q = "" } = await searchParams;
  const tab: Tab = isTab(rawTab) ? rawTab : "open";
  const statuses = tab === "open" ? OPEN_OPERATION_STATUSES : tab === "all" ? undefined : [tab];

  const [{ items, total }, counts, options] = await Promise.all([
    listOperations(ctx.clinic.id, ctx.branchIds, { statuses, query: q }),
    countOperationsByStatus(ctx.clinic.id, ctx.branchIds),
    operationFormOptions(ctx.clinic.id, ctx.branchIds),
  ]);
  const openCount = OPEN_OPERATION_STATUSES.reduce((n, s) => n + counts[s], 0);

  const tabs: { key: Tab; label: string; count: number }[] = [
    { key: "open", label: "المفتوحة", count: openCount },
    ...OPERATION_STATUSES.map((s) => ({
      key: s,
      label: OPERATION_STATUS_LABEL[s],
      count: counts[s],
    })),
    { key: "all", label: "الكل", count: Object.values(counts).reduce((a, b) => a + b, 0) },
  ];
  const href = (t: Tab) =>
    `/admin/operations?${new URLSearchParams({ ...(t !== "open" && { tab: t }), ...(q && { q }) })}`;

  return (
    <div>
      <PageHeader
        title="العمليات"
        subtitle={
          counts.REQUESTED > 0
            ? `${counts.REQUESTED} طلب جديد من المرضى ينتظر التواصل`
            : "طلبات العمليات وتجهيزها ومواعيدها ومتابعتها"
        }
        action={<NewOperationButton options={options} />}
      />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1 rounded-xl bg-muted p-1">
          {tabs.map((t) => (
            <Link
              key={t.key}
              href={href(t.key)}
              className={`rounded-lg px-3 py-1.5 font-sans text-xs font-medium transition-colors ${
                tab === t.key
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {t.label}
              {t.count > 0 && (
                <span
                  className={`ms-1.5 rounded-full px-1.5 ${
                    t.key === "REQUESTED" ? "bg-amber-100 text-amber-700" : "bg-background"
                  }`}
                >
                  {t.count}
                </span>
              )}
            </Link>
          ))}
        </div>
        <form className="relative w-full sm:w-72" action="/admin/operations">
          {tab !== "open" && <input type="hidden" name="tab" value={tab} />}
          <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            name="q"
            defaultValue={q}
            placeholder="بحث بالمريض أو العملية..."
            className="pr-9"
          />
        </form>
      </div>

      <OperationsTable
        items={items}
        basePath="/admin/operations"
        emptyMessage={q ? "لا توجد نتائج مطابقة" : "لا توجد عمليات في هذا القسم"}
      />
      {total > items.length && (
        <p className="mt-3 text-center font-sans text-xs text-muted-foreground">
          يُعرض أول {items.length} من {total} — استخدم البحث للوصول لعملية محددة.
        </p>
      )}
    </div>
  );
}
