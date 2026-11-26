import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatFee } from "@/lib/currency";
import { formatSlotDate } from "@/lib/slot-time";
import { OPERATION_STATUS_LABEL, OPERATION_STATUS_VARIANT, formatHHMMAr } from "@/lib/operations";
import type { OperationListItem } from "@/server/services/operations";

/**
 * The operations list. `basePath` = where a row links to (null = no detail
 * page, e.g. the doctor's read-only view); `showMoney` hides prices for roles
 * that don't handle payments.
 */
export default function OperationsTable({
  items,
  basePath,
  showMoney = true,
  showPatient = true,
  emptyMessage = "لا توجد عمليات",
}: {
  items: OperationListItem[];
  basePath: string | null;
  showMoney?: boolean;
  showPatient?: boolean;
  emptyMessage?: string;
}) {
  const head = "px-4 py-3 text-start font-medium text-muted-foreground";
  const cols = 5 + (showPatient ? 1 : 0) + (showMoney ? 1 : 0);
  return (
    <Card className="overflow-hidden">
      <div className="overflow-x-auto">
        <Table className="w-full font-sans text-sm">
          <TableHeader>
            <TableRow className="border-b border-border bg-muted/40">
              <TableHead className={head}>العملية</TableHead>
              {showPatient && <TableHead className={head}>المريض</TableHead>}
              <TableHead className={head}>الجرّاح</TableHead>
              <TableHead className={head}>الموعد والمكان</TableHead>
              <TableHead className={head}>التجهيزات</TableHead>
              {showMoney && <TableHead className={head}>المتبقي</TableHead>}
              <TableHead className={head}>الحالة</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody className="divide-y divide-border">
            {items.length === 0 && (
              <TableRow>
                <TableCell colSpan={cols} className="py-12 text-center text-muted-foreground">
                  {emptyMessage}
                </TableCell>
              </TableRow>
            )}
            {items.map((o) => (
              <TableRow key={o.id} className="transition-colors hover:bg-muted/30">
                <TableCell className="px-4 py-3 font-medium">
                  {basePath ? (
                    <Link
                      href={`${basePath}/${o.id}`}
                      className="text-foreground transition-colors hover:text-primary"
                    >
                      {o.name}
                    </Link>
                  ) : (
                    o.name
                  )}
                  {o.source === "PATIENT_AI" && o.status === "REQUESTED" && (
                    <p className="mt-0.5 text-xs font-normal text-amber-700">
                      طلب من المريض — يحتاج تواصلاً
                    </p>
                  )}
                </TableCell>
                {showPatient && (
                  <TableCell className="px-4 py-3">
                    <p className="text-foreground">{o.patient.fullName}</p>
                    {o.patient.phone && (
                      <p className="text-xs text-muted-foreground" dir="ltr">
                        {o.patient.phone}
                      </p>
                    )}
                  </TableCell>
                )}
                <TableCell className="px-4 py-3 text-muted-foreground">
                  {o.doctor?.fullName ?? "—"}
                </TableCell>
                <TableCell className="px-4 py-3 text-muted-foreground">
                  {o.scheduledDate ? (
                    <>
                      <p className="text-foreground">
                        {formatSlotDate(`${o.scheduledDate}T00:00:00Z`, {
                          weekday: "short",
                          day: "numeric",
                          month: "short",
                        })}
                        {o.startTime && ` — ${formatHHMMAr(o.startTime)}`}
                      </p>
                      {o.location && <p className="text-xs">{o.location}</p>}
                    </>
                  ) : (
                    <span>{o.location || "لم يُحدَّد بعد"}</span>
                  )}
                </TableCell>
                <TableCell className="px-4 py-3 text-muted-foreground">
                  {o.checklistTotal ? (
                    <span
                      className={
                        o.checklistDone === o.checklistTotal ? "text-emerald-700" : undefined
                      }
                    >
                      {o.checklistDone}/{o.checklistTotal}
                    </span>
                  ) : (
                    "—"
                  )}
                  {!o.consentSigned && o.status === "SCHEDULED" && (
                    <p className="text-xs text-amber-700">الإقرار لم يُوقَّع</p>
                  )}
                </TableCell>
                {showMoney && (
                  <TableCell className="px-4 py-3 text-muted-foreground">
                    {o.remaining != null ? (
                      <span className={o.remaining > 0 ? "text-foreground" : "text-emerald-700"}>
                        {o.remaining > 0 ? formatFee(o.remaining) : "مدفوعة"}
                      </span>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                )}
                <TableCell className="px-4 py-3">
                  <Badge variant={OPERATION_STATUS_VARIANT[o.status]}>
                    {OPERATION_STATUS_LABEL[o.status]}
                  </Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </Card>
  );
}
