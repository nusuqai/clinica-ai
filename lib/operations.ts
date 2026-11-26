import type { OperationSource, OperationStatus } from "@prisma/client";
import type { BadgeVariant } from "@/components/ui/badge";

// Operations (العمليات) — labels, the status machine and small pure helpers.
// Client-safe: no server imports. Design: docs/operations.md.

export const OPERATION_STATUS_LABEL: Record<OperationStatus, string> = {
  REQUESTED: "طلب جديد",
  PREPARING: "قيد التجهيز",
  SCHEDULED: "محددة الموعد",
  DONE: "تمت — متابعة",
  CLOSED: "مغلقة",
  CANCELLED: "ملغاة",
};

export const OPERATION_STATUS_VARIANT: Record<OperationStatus, BadgeVariant> = {
  REQUESTED: "warning",
  PREPARING: "info",
  SCHEDULED: "violet",
  DONE: "success",
  CLOSED: "muted",
  CANCELLED: "danger",
};

export const OPERATION_STATUSES: OperationStatus[] = [
  "REQUESTED",
  "PREPARING",
  "SCHEDULED",
  "DONE",
  "CLOSED",
  "CANCELLED",
];

/** Cases the team still has work on. */
export const OPEN_OPERATION_STATUSES: OperationStatus[] = [
  "REQUESTED",
  "PREPARING",
  "SCHEDULED",
  "DONE",
];

export const OPERATION_SOURCE_LABEL: Record<OperationSource, string> = {
  PATIENT_AI: "طلب من المريض عبر المساعد الذكي",
  STAFF: "أضافها الفريق",
};

/**
 * Status changes made directly (not through scheduling). SCHEDULED is reached
 * only by scheduling (date + time), so it is never a target here. Moving a
 * SCHEDULED case back to PREPARING is "postpone": its date is cleared.
 */
export const OPERATION_TRANSITIONS: Record<OperationStatus, OperationStatus[]> = {
  REQUESTED: ["PREPARING", "CANCELLED"],
  PREPARING: ["CANCELLED"],
  SCHEDULED: ["DONE", "PREPARING", "CANCELLED"],
  DONE: ["CLOSED"],
  CLOSED: ["DONE"],
  CANCELLED: ["PREPARING"],
};

/** Label of the action that moves a case to `to` (from `from`). */
export function transitionLabel(from: OperationStatus, to: OperationStatus): string {
  if (to === "PREPARING" && from === "REQUESTED") return "بدء التجهيز (تم التواصل)";
  if (to === "PREPARING" && from === "SCHEDULED") return "تأجيل (إلغاء الموعد المحدد)";
  if (to === "PREPARING" && from === "CANCELLED") return "إعادة فتح الحالة";
  if (to === "DONE" && from === "CLOSED") return "إعادة فتح المتابعة";
  if (to === "DONE") return "تمت العملية";
  if (to === "CLOSED") return "إغلاق الحالة (انتهت المتابعة)";
  if (to === "CANCELLED") return "إلغاء العملية";
  return OPERATION_STATUS_LABEL[to];
}

/** Can the case still be scheduled / re-scheduled? */
export function isSchedulable(status: OperationStatus): boolean {
  return status === "REQUESTED" || status === "PREPARING" || status === "SCHEDULED";
}

/** Where it takes place: the branch, else the outside hospital. */
export function operationLocation(op: {
  branch?: { name: string } | null;
  hospitalName?: string | null;
}): string {
  if (op.branch?.name) return op.branch.name;
  if (op.hospitalName) return op.hospitalName;
  return "";
}

/** "HH:MM" on a date → minutes since midnight. */
export function hhmmToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

/** "14:30" → "2:30 م" (Arabic clock). */
export function formatHHMMAr(hhmm: string | null | undefined): string {
  if (!hhmm) return "";
  const [h, m] = hhmm.split(":").map(Number);
  return new Date(Date.UTC(2000, 0, 1, h, m)).toLocaleTimeString("ar-EG", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "UTC",
  });
}

/** A DATE column (wall-clock midnight) → "YYYY-MM-DD". */
export function dateKey(d: Date | string): string {
  return new Date(d).toISOString().slice(0, 10);
}

/** Free text → checklist labels: one per line, trimmed, de-duplicated. */
export function parseChecklistText(text: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of text.split(/\r?\n/)) {
    // Drop list markers people paste ("- ", "• ", "1. ", "2) ") but keep
    // content that merely starts with a number ("3 صور أشعة").
    const label = raw
      .replace(/^\s*(?:[-•*·]|\d+[.)])\s*/, "")
      .trim()
      .slice(0, 200);
    if (!label || seen.has(label)) continue;
    seen.add(label);
    out.push(label);
  }
  return out.slice(0, 50);
}
