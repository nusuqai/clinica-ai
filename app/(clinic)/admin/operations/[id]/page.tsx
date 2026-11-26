import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowRight,
  Calendar,
  CheckCircle2,
  Clock,
  MapPin,
  MessageSquare,
  Phone,
  Stethoscope,
  TriangleAlert,
  UserCog,
} from "lucide-react";
import { can, requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  EditOperationButton,
  OperationHeaderActions,
} from "@/components/operations/operation-actions";
import {
  OperationAttachments,
  OperationChecklist,
  OperationInstructions,
  OperationPayments,
} from "@/components/operations/operation-sections";
import {
  OPERATION_SOURCE_LABEL,
  OPERATION_STATUS_LABEL,
  OPERATION_STATUS_VARIANT,
} from "@/lib/operations";
import { getOperation, operationFormOptions, whenLabel } from "@/server/services/operations";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function OperationPage({ params }: PageProps) {
  const { id } = await params;
  const ctx = await requirePermission("operations");
  const [op, options, clinic] = await Promise.all([
    getOperation(ctx.clinic.id, ctx.branchIds, id),
    operationFormOptions(ctx.clinic.id, ctx.branchIds),
    prisma.clinic.findUnique({ where: { id: ctx.clinic.id }, select: { timezone: true } }),
  ]);
  const timeZone = clinic?.timezone ?? "Africa/Cairo";
  if (!op) notFound();

  const editable = op.status !== "CANCELLED" && op.status !== "CLOSED";
  const when = op.scheduledDate
    ? whenLabel(new Date(`${op.scheduledDate}T00:00:00Z`), op.startTime)
    : null;
  const place = op.branchName
    ? `فرع ${op.branchName}${op.branchAddress ? ` — ${op.branchAddress}` : ""}`
    : op.hospitalName;
  const facts: { icon: React.ReactNode; label: string; value: React.ReactNode }[] = [
    {
      icon: <Calendar className="h-4 w-4" />,
      label: "الموعد",
      value: when
        ? `${when}${op.durationMin ? ` (${op.durationMin} دقيقة)` : ""}`
        : "لم يُحدَّد بعد",
    },
    { icon: <MapPin className="h-4 w-4" />, label: "المكان", value: place || "لم يُحدَّد" },
    {
      icon: <Stethoscope className="h-4 w-4" />,
      label: "الجرّاح",
      value: op.doctor?.fullName ?? "لم يُحدَّد",
    },
    { icon: <Clock className="h-4 w-4" />, label: "التخدير", value: op.anesthesia || "—" },
    {
      icon: <CheckCircle2 className="h-4 w-4" />,
      label: "الإقرار",
      value: op.consentSigned ? (
        <span className="text-emerald-700">موقّع</span>
      ) : (
        <span className="text-amber-700">لم يُوقَّع بعد</span>
      ),
    },
    {
      icon: <UserCog className="h-4 w-4" />,
      label: "المسؤول عن الحالة",
      value: op.coordinator?.fullName ?? "—",
    },
  ];

  return (
    <div>
      <Link
        href="/admin/operations"
        className="mb-6 inline-flex items-center gap-1.5 font-sans text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowRight className="h-4 w-4" />
        العودة إلى العمليات
      </Link>

      <Card className="p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="mb-1 flex flex-wrap items-center gap-2">
              <h1 className="font-heading text-2xl font-bold text-foreground">{op.name}</h1>
              <Badge variant={OPERATION_STATUS_VARIANT[op.status]}>
                {OPERATION_STATUS_LABEL[op.status]}
              </Badge>
              {op.serviceName && op.serviceName !== op.name && (
                <Badge variant="outline">{op.serviceName}</Badge>
              )}
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-4 font-sans text-sm text-muted-foreground">
              {can(ctx, "patients") ? (
                <Link
                  href={`/admin/patients/${op.patient.id}`}
                  className="font-medium text-foreground hover:text-primary"
                >
                  {op.patient.fullName}
                </Link>
              ) : (
                <span className="font-medium text-foreground">{op.patient.fullName}</span>
              )}
              {op.patient.phone && (
                <span className="flex items-center gap-1.5" dir="ltr">
                  <Phone className="h-3.5 w-3.5" />
                  {op.patient.phone}
                </span>
              )}
              {op.conversationId && can(ctx, "messages") && (
                <Link
                  href={`/admin/messages?id=${op.conversationId}`}
                  className="flex items-center gap-1.5 hover:text-primary"
                >
                  <MessageSquare className="h-3.5 w-3.5" />
                  المحادثة
                </Link>
              )}
              <span className="text-xs">{OPERATION_SOURCE_LABEL[op.source]}</span>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {editable && <EditOperationButton op={op} options={options} />}
          </div>
        </div>

        {op.status === "REQUESTED" && (
          <div className="mt-4 flex gap-2 rounded-xl bg-amber-50 p-3 font-sans text-sm text-amber-800">
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <p className="font-medium">
                طلب من المريض عبر المساعد الذكي — تواصل معه لترتيب العملية.
              </p>
              {op.requestNote && <p className="mt-1 whitespace-pre-wrap">{op.requestNote}</p>}
            </div>
          </div>
        )}
        {op.status === "CANCELLED" && op.cancelReason && (
          <p className="mt-4 rounded-xl bg-red-50 p-3 font-sans text-sm text-red-700">
            سبب الإلغاء: {op.cancelReason}
          </p>
        )}

        <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {facts.map((f) => (
            <div
              key={f.label}
              className="flex items-start gap-2 rounded-xl bg-muted/40 px-3 py-2.5"
            >
              <span className="mt-0.5 text-muted-foreground">{f.icon}</span>
              <div className="min-w-0">
                <p className="font-sans text-xs text-muted-foreground">{f.label}</p>
                <p className="font-sans text-sm text-foreground">{f.value}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-5 border-t border-border pt-4">
          <OperationHeaderActions op={op} />
        </div>
      </Card>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <OperationChecklist op={op} editable={editable} />
        <OperationPayments op={op} editable={op.status !== "CANCELLED"} />
        <OperationInstructions op={op} editable={editable} />
        <OperationAttachments op={op} editable={op.status !== "CANCELLED"} />
      </div>

      {(op.notes || (op.requestNote && op.status !== "REQUESTED")) && (
        <Card className="mt-6 space-y-3 p-5">
          {op.requestNote && op.status !== "REQUESTED" && (
            <div>
              <p className="mb-1 font-sans text-xs font-medium text-muted-foreground">طلب المريض</p>
              <p className="whitespace-pre-wrap font-sans text-sm text-foreground">
                {op.requestNote}
              </p>
            </div>
          )}
          {op.notes && (
            <div>
              <p className="mb-1 font-sans text-xs font-medium text-muted-foreground">
                ملاحظات داخلية
              </p>
              <p className="whitespace-pre-wrap font-sans text-sm text-foreground">{op.notes}</p>
            </div>
          )}
        </Card>
      )}

      <Card className="mt-6 p-5">
        <h2 className="mb-4 font-heading text-base font-bold text-foreground">سجل الحالة</h2>
        {op.events.length === 0 ? (
          <p className="font-sans text-sm text-muted-foreground">لا يوجد</p>
        ) : (
          <ol className="space-y-3 border-s border-border ps-4">
            {op.events.map((e) => (
              <li key={e.id} className="relative">
                <span className="absolute -start-[21px] top-1.5 h-2 w-2 rounded-full bg-primary/60" />
                <p className="font-sans text-sm text-foreground">{e.text}</p>
                <p className="font-sans text-xs text-muted-foreground">
                  {e.actorName ?? "المساعد الذكي"} ·{" "}
                  {new Date(e.createdAt).toLocaleString("ar-EG", {
                    day: "numeric",
                    month: "short",
                    hour: "numeric",
                    minute: "2-digit",
                    timeZone,
                  })}
                </p>
              </li>
            ))}
          </ol>
        )}
      </Card>
    </div>
  );
}
