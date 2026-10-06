import Link from "next/link";
import {
  Stethoscope,
  Pill,
  ClipboardList,
  CalendarClock,
  MapPin,
  FileText,
  UserPen,
  CalendarSearch,
  Paperclip,
} from "lucide-react";
import type { TreatmentRecordView } from "@/server/services/treatments";
import type { AttachmentView } from "@/server/services/attachments";
import { PROCEDURE_KIND_LABELS } from "@/lib/labels";
import { formatSlotDate } from "@/lib/slot-time";
import { Card } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";

// One patient's clinical history, newest visit first. Rendered identically for
// the doctor, the admin and the patient — the three pages differ in what they
// are ALLOWED to fetch, not in how it looks. A server component: nothing here
// needs client state.

interface RecordTimelineProps {
  records: TreatmentRecordView[];
  /** Shown when the patient has no records yet. */
  emptyMessage?: string;
  /** Rendered in each record's header — the doctor's edit button, for instance. */
  recordAction?: (record: TreatmentRecordView) => React.ReactNode;
  /**
   * When set, each record whose visit came from an appointment links to that
   * appointment's full page under this base path (e.g. "/doctor/appointments").
   * Omit on the appointment page itself (linking back to the same visit is
   * pointless). This is what lets a reader jump from a history entry to "which
   * appointment was this, on what date".
   */
  appointmentBasePath?: string;
  /** Replaces the static "عُدّل N مرات" badge — e.g. a clickable badge that opens
   *  the edit-history modal (admin). Only called when revisionCount > 0. */
  renderRevisionBadge?: (record: TreatmentRecordView) => React.ReactNode;
  /** Files attached to each visit, keyed by appointmentId — shown under the
   *  record whose visit they belong to. Read-only here (download/open); managing
   *  them lives on the appointment page. Ignored when `renderAttachments` is set. */
  attachmentsByAppointment?: Record<string, AttachmentView[]>;
  /** Renders the attachments area for a record — use to swap the read-only list
   *  for a manageable one (upload/delete/rename) inline, e.g. on the admin user
   *  profile. When provided, it fully replaces the built-in read-only block. */
  renderAttachments?: (record: TreatmentRecordView) => React.ReactNode;
}

export default function RecordTimeline({
  records,
  emptyMessage = "لا يوجد سجل علاجي بعد",
  recordAction,
  appointmentBasePath,
  renderRevisionBadge,
  attachmentsByAppointment,
  renderAttachments,
}: RecordTimelineProps) {
  if (records.length === 0) {
    return (
      <Card className="py-16 text-center">
        <FileText className="mx-auto mb-4 h-12 w-12 text-muted-foreground/30" />
        <p className="font-sans font-medium text-muted-foreground">{emptyMessage}</p>
        <p className="mt-1 font-sans text-sm text-muted-foreground">
          يظهر هنا ما تم تشخيصه وإجراؤه في كل زيارة
        </p>
      </Card>
    );
  }

  return (
    <ol className="relative space-y-4 border-s-2 border-border ps-6">
      {records.map((record) => (
        <li key={record.id} className="relative">
          {/* Timeline dot, centred on the rail */}
          <span
            aria-hidden
            className="absolute -start-[1.9rem] top-5 flex h-4 w-4 items-center justify-center rounded-full border-2 border-card bg-primary"
          />

          <article className="overflow-hidden rounded-2xl border border-border bg-card">
            <header className="flex flex-wrap items-start justify-between gap-3 border-b border-border bg-muted/30 px-5 py-4">
              <div className="min-w-0">
                <p className="font-heading text-base font-bold text-foreground">
                  {formatSlotDate(record.visitDate)}
                </p>
                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 font-sans text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Stethoscope className="h-3.5 w-3.5 flex-shrink-0" />
                    د. {record.doctorName}
                    {record.doctorSpecialty ? ` · ${record.doctorSpecialty}` : ""}
                  </span>
                  {record.branchName && (
                    <span className="flex items-center gap-1">
                      <MapPin className="h-3.5 w-3.5 flex-shrink-0" />
                      {record.branchName}
                    </span>
                  )}
                  {record.enteredByName && (
                    <span className="flex items-center gap-1" title="أُدخل نيابةً عن الطبيب">
                      <UserPen className="h-3.5 w-3.5 flex-shrink-0" />
                      أدخله {record.enteredByName}
                    </span>
                  )}
                  {record.revisionCount > 0 &&
                    (renderRevisionBadge ? (
                      renderRevisionBadge(record)
                    ) : (
                      <span
                        className="rounded-full bg-amber-100 px-2 py-0.5 font-medium text-amber-700"
                        title={`عُدّل ${record.revisionCount} مرة`}
                      >
                        عُدّل {record.revisionCount === 1 ? "مرة" : `${record.revisionCount} مرات`}
                      </span>
                    ))}
                  {appointmentBasePath && record.appointmentId && (
                    <Link
                      href={`${appointmentBasePath}/${record.appointmentId}`}
                      className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 font-medium text-primary transition-colors hover:bg-primary/20"
                      title="فتح صفحة الموعد المرتبط بهذا السجل"
                    >
                      <CalendarSearch className="h-3.5 w-3.5" />
                      الموعد المرتبط
                    </Link>
                  )}
                </div>
              </div>
              {recordAction && <div className="flex-shrink-0">{recordAction(record)}</div>}
            </header>

            <div className="space-y-4 px-5 py-4">
              {record.chiefComplaint && <Field label="الشكوى" value={record.chiefComplaint} />}
              {record.diagnosis && <Field label="التشخيص" value={record.diagnosis} emphasis />}
              {record.clinicalNotes && (
                <Field label="ملاحظات الطبيب" value={record.clinicalNotes} />
              )}

              {record.procedures.length > 0 && (
                <section>
                  <SectionLabel icon={ClipboardList} text="الإجراءات" />
                  <ul className="space-y-1.5">
                    {record.procedures.map((p) => (
                      <li
                        key={p.id}
                        className="flex flex-wrap items-baseline gap-x-2 rounded-xl bg-muted/40 px-3 py-2 font-sans text-sm"
                      >
                        <span className="rounded-md bg-primary/10 px-1.5 py-0.5 text-xs font-medium text-primary">
                          {PROCEDURE_KIND_LABELS[p.kind]}
                        </span>
                        <span className="font-medium text-foreground">{p.name}</span>
                        {p.note && (
                          <span className="text-xs text-muted-foreground">— {p.note}</span>
                        )}
                        {p.cost && (
                          <span className="ms-auto text-xs text-muted-foreground" dir="ltr">
                            {p.cost}
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {record.prescriptions.length > 0 && (
                <section>
                  <SectionLabel icon={Pill} text="الروشتة" />
                  <ul className="space-y-1.5">
                    {record.prescriptions.map((p) => (
                      <li key={p.id} className="rounded-xl bg-muted/40 px-3 py-2 font-sans text-sm">
                        <span className="font-medium text-foreground">{p.drugName}</span>
                        {/* Dose line — only the parts the doctor filled in. */}
                        {(p.dose || p.frequency || p.durationDays) && (
                          <span className="text-muted-foreground">
                            {" — "}
                            {[
                              p.dose,
                              p.frequency,
                              p.durationDays ? `لمدة ${p.durationDays} يوم` : null,
                            ]
                              .filter(Boolean)
                              .join(" · ")}
                          </span>
                        )}
                        {p.instructions && (
                          <p className="mt-0.5 text-xs text-muted-foreground">{p.instructions}</p>
                        )}
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {record.followUpDate && (
                <Alert variant="info" className="items-center gap-1.5 border-transparent px-3 py-2">
                  <CalendarClock className="h-4 w-4 flex-shrink-0" />
                  موعد المتابعة المقترح: {formatSlotDate(record.followUpDate)}
                </Alert>
              )}

              {renderAttachments && renderAttachments(record)}

              {!renderAttachments &&
                (() => {
                  const files = record.appointmentId
                    ? (attachmentsByAppointment?.[record.appointmentId] ?? [])
                    : [];
                  if (files.length === 0) return null;
                  return (
                    <section>
                      <SectionLabel icon={Paperclip} text="المرفقات" />
                      <ul className="flex flex-wrap gap-2">
                        {files.map((a) => {
                          const href = `/api/attachments/${a.id}`;
                          return (
                            <li key={a.id}>
                              <a
                                href={href}
                                target="_blank"
                                rel="noopener noreferrer"
                                title={a.fileName}
                                className="inline-flex max-w-[220px] items-center gap-1.5 rounded-lg border border-border bg-muted/40 px-2.5 py-1.5 font-sans text-xs text-foreground transition-colors hover:bg-muted"
                              >
                                {a.kind === "image" ? (
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img
                                    src={href}
                                    alt={a.fileName}
                                    className="h-6 w-6 flex-shrink-0 rounded object-cover"
                                  />
                                ) : (
                                  <FileText
                                    className={`h-4 w-4 flex-shrink-0 ${a.kind === "pdf" ? "text-red-500" : "text-muted-foreground"}`}
                                  />
                                )}
                                <span className="truncate">{a.fileName}</span>
                              </a>
                            </li>
                          );
                        })}
                      </ul>
                    </section>
                  );
                })()}
            </div>
          </article>
        </li>
      ))}
    </ol>
  );
}

function Field({ label, value, emphasis }: { label: string; value: string; emphasis?: boolean }) {
  return (
    <div>
      <p className="mb-1 font-sans text-xs font-medium text-muted-foreground">{label}</p>
      <p
        className={[
          "whitespace-pre-wrap font-sans text-sm",
          emphasis ? "font-medium text-foreground" : "text-foreground/90",
        ].join(" ")}
      >
        {value}
      </p>
    </div>
  );
}

function SectionLabel({
  icon: Icon,
  text,
}: {
  icon: React.ComponentType<{ className?: string }>;
  text: string;
}) {
  return (
    <p className="mb-1.5 flex items-center gap-1.5 font-sans text-xs font-medium text-muted-foreground">
      <Icon className="h-3.5 w-3.5" />
      {text}
    </p>
  );
}
