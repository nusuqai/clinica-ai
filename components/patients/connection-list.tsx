import Link from "next/link";
import {
  CalendarDays,
  CalendarPlus,
  ChevronDown,
  Check,
  FileText,
  Link2,
  Phone,
  PhoneOff,
  Users,
  X,
} from "lucide-react";
import type { ConnectionView } from "@/server/services/connections";
import { CONNECTION_RELATION_LABELS } from "@/lib/labels";
import ConnectionPhoneForm from "./connection-phone-form";

// One patient's connections — the relatives they book for — each row expanding
// to its details. Rendered for both the admin and the patient: the admin passes
// `profileBasePath` to link through, the patient passes `editablePhones` to add
// a relative's WhatsApp number. Native <details> does the expanding.

interface ConnectionListProps {
  connections: ConnectionView[];
  /** When set, each connected person links to `${profileBasePath}/${id}`. */
  profileBasePath?: string;
  emptyMessage?: string;
  /** Lets the viewer (the patient themselves) add/change a relative's WhatsApp number. */
  editablePhones?: boolean;
  /** When set, relatives whose records the viewer may read link to `${recordsBasePath}/${id}`. */
  recordsBasePath?: string;
}

const formatDate = (value: Date) =>
  value.toLocaleDateString("ar-EG", { day: "numeric", month: "long", year: "numeric" });

export default function ConnectionList({
  connections,
  profileBasePath,
  emptyMessage = "لا يحجز هذا المريض لأي شخص بعد",
  editablePhones = false,
  recordsBasePath,
}: ConnectionListProps) {
  if (connections.length === 0) {
    return (
      <div className="rounded-2xl border border-border bg-card py-12 text-center">
        <Users className="mx-auto mb-3 h-10 w-10 text-muted-foreground/30" />
        <p className="font-sans font-medium text-muted-foreground">{emptyMessage}</p>
        <p className="mt-1 font-sans text-sm text-muted-foreground">
          تظهر هنا الأسماء التي يحجز لها المريض
        </p>
      </div>
    );
  }

  return (
    <ul className="space-y-3">
      {connections.map((c) => {
        const revoked = c.revokedAt !== null;
        const initial = c.other.fullName.trim().charAt(0) || "؟";

        return (
          <li key={c.id}>
            <details
              className={`group overflow-hidden rounded-2xl border border-border bg-card ${
                revoked ? "opacity-70" : ""
              }`}
            >
              <summary className="flex cursor-pointer list-none items-center gap-3 px-5 py-3 transition-colors hover:bg-muted/40 [&::-webkit-details-marker]:hidden">
                <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-primary/10">
                  <span className="font-sans font-bold text-primary">{initial}</span>
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate font-sans text-sm font-medium text-foreground">
                      {c.other.fullName}
                    </span>
                    <span className="rounded-full bg-primary/10 px-2 py-px font-sans text-[11px] font-medium text-primary">
                      {CONNECTION_RELATION_LABELS[c.relation]}
                    </span>
                    {editablePhones && !revoked && !c.other.phone && (
                      <span className="rounded-full bg-amber-50 px-2 py-px font-sans text-[11px] font-medium text-amber-700">
                        بدون رقم واتساب
                      </span>
                    )}
                    {revoked ? (
                      <span className="rounded-full bg-gray-100 px-2 py-px font-sans text-[11px] font-medium text-gray-500">
                        ملغاة
                      </span>
                    ) : (
                      <span className="rounded-full bg-emerald-50 px-2 py-px font-sans text-[11px] font-medium text-emerald-600">
                        نشطة
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 font-sans text-xs text-muted-foreground">
                    {editablePhones ? "تحجز له" : "يحجز له هذا المريض"}
                  </p>
                </div>

                <ChevronDown className="h-4 w-4 flex-shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
              </summary>

              <dl className="grid gap-x-6 gap-y-3 border-t border-border bg-muted/20 px-5 py-4 font-sans text-sm sm:grid-cols-2">
                {editablePhones && !revoked ? (
                  <div className="sm:col-span-2">
                    <ConnectionPhoneForm dependentId={c.other.id} currentPhone={c.other.phone} />
                  </div>
                ) : (
                  <Detail icon={c.other.phone ? Phone : PhoneOff} label="رقم واتساب">
                    {c.other.phone ? (
                      <span dir="ltr">{c.other.phone}</span>
                    ) : (
                      "لا يوجد — تصل رسائله إلى هذا المريض"
                    )}
                  </Detail>
                )}
                <Detail icon={CalendarDays} label="المواعيد في العيادة">
                  {c.otherAppointmentCount} موعد
                </Detail>
                <Detail icon={CalendarPlus} label="الحجز نيابةً عنه">
                  <Permission allowed={c.canBook} />
                </Detail>
                <Detail icon={FileText} label="الاطلاع على السجل العلاجي">
                  <Permission allowed={c.canViewRecords} />
                </Detail>
                <Detail icon={Link2} label="تاريخ الربط">
                  {formatDate(c.createdAt)}
                  {c.revokedAt && (
                    <span className="text-muted-foreground">
                      {" "}
                      · أُلغيت {formatDate(c.revokedAt)}
                    </span>
                  )}
                </Detail>

                {recordsBasePath && c.canViewRecords && !revoked && (
                  <div className="flex items-end sm:justify-end">
                    <Link
                      href={`${recordsBasePath}/${c.other.id}`}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-primary/10 px-3.5 py-2 font-sans text-sm font-medium text-primary transition-colors hover:bg-primary/15"
                    >
                      <FileText className="h-4 w-4" />
                      عرض السجل العلاجي
                    </Link>
                  </div>
                )}

                {profileBasePath && (
                  <div className="flex items-end sm:justify-end">
                    <Link
                      href={`${profileBasePath}/${c.other.id}`}
                      className="font-sans text-sm font-medium text-primary hover:underline"
                    >
                      عرض ملف {c.other.fullName}
                    </Link>
                  </div>
                )}
              </dl>
            </details>
          </li>
        );
      })}
    </ul>
  );
}

function Detail({
  icon: Icon,
  label,
  children,
}: {
  icon: React.ElementType;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-2.5">
      <Icon className="mt-0.5 h-4 w-4 flex-shrink-0 text-muted-foreground" />
      <div className="min-w-0">
        <dt className="text-xs text-muted-foreground">{label}</dt>
        <dd className="mt-0.5 text-foreground">{children}</dd>
      </div>
    </div>
  );
}

function Permission({ allowed }: { allowed: boolean }) {
  return allowed ? (
    <span className="inline-flex items-center gap-1 text-emerald-600">
      <Check className="h-3.5 w-3.5" />
      مسموح
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 text-muted-foreground">
      <X className="h-3.5 w-3.5" />
      غير مسموح
    </span>
  );
}
