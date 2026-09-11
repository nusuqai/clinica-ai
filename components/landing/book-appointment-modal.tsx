"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import {
  X,
  Clock,
  CheckCircle,
  AlertCircle,
  LogIn,
  ChevronDown,
  Users,
} from "lucide-react";
import Link from "next/link";
import {
  bookAppointmentAction,
  bookOrderAppointmentAction,
  getAvailableDaysAction,
  getAvailableSlotsAction,
  getOrderBookingInfoAction,
} from "@/server/actions/patient";
import { formatSlotDate, formatSlotTime } from "@/lib/slot-time";

interface Doctor {
  id: string;
  name: string;
  specialty: string;
  fee: number | null;
}

interface Slot {
  id: string;
  startTime: string;
  endTime: string;
}

type Mode = "SLOT_BASED" | "ORDER_BASED";

interface AvailableDay {
  date: string;
  mode: Mode;
}

interface OrderInfo {
  available: boolean;
  remaining: number | null;
  nextOrderNumber: number;
  currentOrder: number | null;
  estimatedDurationMin: number | null;
  expectedTime: string | null;
}

/** Per-day payload, loaded lazily when a day is opened and cached in state. */
type DayData =
  | { kind: "slots"; slots: Slot[] }
  | { kind: "queue"; info: OrderInfo };

/** What the patient has chosen to book, carried into the confirm step. */
type Selection =
  | { mode: "SLOT_BASED"; date: string; slot: Slot }
  | { mode: "ORDER_BASED"; date: string; info: OrderInfo };

interface Props {
  doctor: Doctor;
  isAuthenticated: boolean;
  isPatient: boolean;
  onClose: () => void;
  /** Where the "view my appointments" success link points. */
  appointmentsHref?: string;
  /** Auth links for the "sign in to continue" state (clinic-scoped when set). */
  loginHref?: string;
  registerHref?: string;
}

function formatTime(iso: string) {
  return formatSlotTime(iso, { hour: "2-digit", minute: "2-digit", hour12: true });
}

/** Estimated wait for the joining patient, or null when it can't be computed. */
function queueWait(info: OrderInfo): number | null {
  if (info.estimatedDurationMin == null || info.currentOrder == null) return null;
  return Math.max(0, info.nextOrderNumber - info.currentOrder) * info.estimatedDurationMin;
}

export function BookAppointmentModal({
  doctor,
  isAuthenticated,
  isPatient,
  onClose,
  appointmentsHref = "/",
  loginHref = "/login",
  registerHref = "/register",
}: Props) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const needsAuth = !isAuthenticated || !isPatient;
  const [step, setStep] = useState<1 | 2>(1);
  const [availableDays, setAvailableDays] = useState<AvailableDay[]>([]);
  const [daysLoading, setDaysLoading] = useState(true);
  const [daysError, setDaysError] = useState("");

  // Accordion: at most one open day; each day's data is fetched on first open.
  const [openDate, setOpenDate] = useState<string | null>(null);
  const [dayData, setDayData] = useState<Record<string, DayData>>({});
  const [dayLoading, setDayLoading] = useState<Record<string, boolean>>({});
  const [dayError, setDayError] = useState<Record<string, string>>({});

  const [selection, setSelection] = useState<Selection | null>(null);
  const [notes, setNotes] = useState("");
  const [isPending, startTransition] = useTransition();
  const [success, setSuccess] = useState(false);
  const [bookedOrder, setBookedOrder] = useState<number | null>(null);
  const [bookingError, setBookingError] = useState("");

  // Load the doctor's available days once, up-front. Only dates + mode — each
  // day's slots/queue are loaded lazily on open so opening the list stays fast.
  useEffect(() => {
    if (needsAuth) return;
    let cancelled = false;
    setDaysLoading(true);
    setDaysError("");
    getAvailableDaysAction(doctor.id)
      .then((days) => {
        if (cancelled) return;
        setAvailableDays(days);
        if (days.length === 0)
          setDaysError("لا توجد أيام متاحة لهذا الطبيب حالياً");
      })
      .catch(() => {
        if (!cancelled)
          setDaysError("تعذر تحميل الأيام المتاحة، يرجى المحاولة مجدداً");
      })
      .finally(() => {
        if (!cancelled) setDaysLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doctor.id, needsAuth]);

  // Lock background scroll while modal is open
  useEffect(() => {
    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = original;
    };
  }, []);

  function handleOverlayClick(e: React.MouseEvent) {
    if (e.target === overlayRef.current) onClose();
  }

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  async function toggleDay(date: string, mode: Mode) {
    // Collapse if already open.
    if (openDate === date) {
      setOpenDate(null);
      return;
    }
    setOpenDate(date);
    // Already loaded or in flight — nothing to fetch.
    if (dayData[date] || dayLoading[date]) return;

    setDayLoading((m) => ({ ...m, [date]: true }));
    setDayError((m) => ({ ...m, [date]: "" }));
    try {
      if (mode === "ORDER_BASED") {
        const info = await getOrderBookingInfoAction(doctor.id, date);
        if (!info) {
          setDayError((m) => ({ ...m, [date]: "تعذّر تحميل حالة الطابور" }));
        } else {
          setDayData((m) => ({ ...m, [date]: { kind: "queue", info } }));
        }
      } else {
        const slots = await getAvailableSlotsAction(doctor.id, date);
        setDayData((m) => ({ ...m, [date]: { kind: "slots", slots } }));
        if (slots.length === 0)
          setDayError((m) => ({ ...m, [date]: "لا توجد مواعيد متاحة في هذا اليوم" }));
      }
    } catch {
      setDayError((m) => ({ ...m, [date]: "تعذّر التحميل، يرجى المحاولة مجدداً" }));
    } finally {
      setDayLoading((m) => ({ ...m, [date]: false }));
    }
  }

  function handleBook() {
    if (!selection) return;
    setBookingError("");
    startTransition(async () => {
      if (selection.mode === "SLOT_BASED") {
        const res = await bookAppointmentAction(
          selection.slot.id,
          notes || undefined,
        );
        if (res.ok) setSuccess(true);
        else setBookingError(res.error ?? "حدث خطأ غير متوقع");
      } else {
        const res = await bookOrderAppointmentAction(
          doctor.id,
          selection.date,
          notes || undefined,
        );
        if (res.ok) {
          setBookedOrder(res.orderNumber ?? null);
          setSuccess(true);
        } else {
          setBookingError(res.error ?? "حدث خطأ غير متوقع");
        }
      }
    });
  }

  const initials = doctor.name
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0])
    .join("");

  return (
    <div
      ref={overlayRef}
      onClick={handleOverlayClick}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
    >
      <div className="relative flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-border px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary font-heading text-sm font-bold text-white">
              {initials}
            </div>
            <div>
              <p className="font-sans text-sm font-semibold text-text">
                {doctor.name}
              </p>
              <p className="font-sans text-xs text-text/50">
                {doctor.specialty}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-text/40 transition-colors hover:bg-muted hover:text-text"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6">
          {/* Not logged in */}
          {needsAuth && (
            <div className="flex flex-col items-center gap-4 py-4 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-accent/10">
                <LogIn className="h-7 w-7 text-accent" />
              </div>
              <div>
                <p className="font-heading text-lg font-bold text-text">
                  سجّل دخولك للمتابعة
                </p>
                <p className="mt-1 font-sans text-sm text-text/50">
                  تحتاج إلى حساب مريض لحجز موعد
                </p>
              </div>
              <div className="flex w-full flex-col gap-2">
                <Link
                  href={loginHref}
                  className="block w-full rounded-xl bg-primary py-3 text-center font-medium text-white transition-opacity hover:opacity-90"
                >
                  تسجيل الدخول
                </Link>
                <Link
                  href={registerHref}
                  className="block w-full rounded-xl border border-border py-3 text-center font-medium text-text transition-colors hover:bg-muted"
                >
                  إنشاء حساب جديد
                </Link>
              </div>
            </div>
          )}

          {/* Step 1 — Day accordion */}
          {!needsAuth && step === 1 && !success && (
            <div className="flex flex-col gap-5">
              <div>
                <p className="mb-1 font-heading text-base font-bold text-text">
                  اختر يوم الموعد
                </p>
                <p className="font-sans text-sm text-text/50">
                  اضغط على اليوم لعرض الأوقات المتاحة أو حالة الدور
                </p>
              </div>

              {daysLoading && (
                <div className="flex items-center justify-center py-6">
                  <div className="h-6 w-6 animate-spin rounded-full border-2 border-accent border-t-transparent" />
                </div>
              )}

              {daysError && !daysLoading && (
                <div className="flex items-center gap-2 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  {daysError}
                </div>
              )}

              {!daysLoading && availableDays.length > 0 && (
                <div className="flex flex-col gap-2">
                  {availableDays.map(({ date, mode }) => {
                    const isOpen = openDate === date;
                    const data = dayData[date];
                    const loading = dayLoading[date];
                    const errorMsg = dayError[date];
                    return (
                      <div
                        key={date}
                        className="overflow-hidden rounded-xl border border-border"
                      >
                        {/* Day header */}
                        <button
                          onClick={() => toggleDay(date, mode)}
                          className="flex w-full items-center justify-between gap-2 px-4 py-3 text-start transition-colors hover:bg-muted/60"
                        >
                          <span className="flex items-center gap-2">
                            <span className="font-sans text-sm font-medium text-text">
                              {formatSlotDate(date, {
                                weekday: "long",
                                day: "numeric",
                                month: "long",
                              })}
                            </span>
                            {mode === "ORDER_BASED" && (
                              <span className="inline-flex items-center gap-1 rounded-full bg-accent/10 px-2 py-0.5 font-sans text-[11px] font-medium text-accent">
                                <Users className="h-3 w-3" />
                                طابور
                              </span>
                            )}
                          </span>
                          <ChevronDown
                            className={`h-4 w-4 shrink-0 text-text/40 transition-transform ${
                              isOpen ? "rotate-180" : ""
                            }`}
                          />
                        </button>

                        {/* Day body — lazy content */}
                        {isOpen && (
                          <div className="border-t border-border px-4 py-3">
                            {loading && (
                              <div className="flex items-center justify-center py-4">
                                <div className="h-5 w-5 animate-spin rounded-full border-2 border-accent border-t-transparent" />
                              </div>
                            )}

                            {errorMsg && !loading && (
                              <div className="flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
                                <AlertCircle className="h-4 w-4 shrink-0" />
                                {errorMsg}
                              </div>
                            )}

                            {/* Slot-based day */}
                            {!loading &&
                              data?.kind === "slots" &&
                              data.slots.length > 0 && (
                                <>
                                  <p className="mb-2 flex items-center gap-1.5 font-sans text-xs font-medium text-text/60">
                                    <Clock className="h-3.5 w-3.5" />
                                    اختر وقت الموعد
                                  </p>
                                  <div className="grid grid-cols-3 gap-2">
                                    {data.slots.map((slot) => {
                                      const isSel =
                                        selection?.mode === "SLOT_BASED" &&
                                        selection.slot.id === slot.id;
                                      return (
                                        <button
                                          key={slot.id}
                                          onClick={() =>
                                            setSelection({
                                              mode: "SLOT_BASED",
                                              date,
                                              slot,
                                            })
                                          }
                                          className={`rounded-lg border px-3 py-2 text-center font-sans text-sm font-medium transition-all ${
                                            isSel
                                              ? "border-accent bg-accent text-white shadow-md shadow-accent/20"
                                              : "border-border bg-background text-text hover:border-accent/50"
                                          }`}
                                        >
                                          {formatTime(slot.startTime)}
                                        </button>
                                      );
                                    })}
                                  </div>
                                </>
                              )}

                            {/* Order-based (queue) day */}
                            {!loading && data?.kind === "queue" && (
                              <QueueBox
                                info={data.info}
                                selected={
                                  selection?.mode === "ORDER_BASED" &&
                                  selection.date === date
                                }
                                onSelect={() =>
                                  setSelection({
                                    mode: "ORDER_BASED",
                                    date,
                                    info: data.info,
                                  })
                                }
                              />
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {selection && (
                <button
                  onClick={() => setStep(2)}
                  className="mt-1 w-full rounded-xl bg-primary py-3 font-medium text-white transition-opacity hover:opacity-90"
                >
                  التالي — إضافة ملاحظات
                </button>
              )}
            </div>
          )}

          {/* Step 2 — Notes + confirm */}
          {!needsAuth && step === 2 && !success && selection && (
            <div className="flex flex-col gap-5">
              {/* Summary */}
              <div className="rounded-xl bg-muted px-4 py-3">
                <p className="font-sans text-xs font-medium text-text/50">
                  تفاصيل الموعد
                </p>
                <div className="mt-2 flex flex-col gap-1">
                  <div className="flex items-center justify-between">
                    <span className="font-sans text-sm text-text/70">التاريخ</span>
                    <span className="font-sans text-sm font-medium text-text">
                      {formatSlotDate(selection.date, {
                        weekday: "long",
                        year: "numeric",
                        month: "long",
                        day: "numeric",
                      })}
                    </span>
                  </div>
                  {selection.mode === "SLOT_BASED" ? (
                    <div className="flex items-center justify-between">
                      <span className="font-sans text-sm text-text/70">الوقت</span>
                      <span className="font-sans text-sm font-medium text-text">
                        {formatTime(selection.slot.startTime)} —{" "}
                        {formatTime(selection.slot.endTime)}
                      </span>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center justify-between">
                        <span className="font-sans text-sm text-text/70">
                          نظام الحجز
                        </span>
                        <span className="font-sans text-sm font-medium text-text">
                          الدور — رقمك {selection.info.nextOrderNumber}
                        </span>
                      </div>
                      {selection.info.expectedTime && (
                        <div className="flex items-center justify-between">
                          <span className="font-sans text-sm text-text/70">
                            الوقت المتوقع
                          </span>
                          <span className="font-sans text-sm font-medium text-text">
                            ~{selection.info.expectedTime}
                          </span>
                        </div>
                      )}
                    </>
                  )}
                  {doctor.fee && (
                    <div className="flex items-center justify-between">
                      <span className="font-sans text-sm text-text/70">
                        رسوم الكشف
                      </span>
                      <span className="font-sans text-sm font-semibold text-accent">
                        {doctor.fee} جنيه
                      </span>
                    </div>
                  )}
                </div>
              </div>

              <div>
                <label className="mb-1.5 block font-sans text-sm font-medium text-text">
                  ملاحظات للطبيب{" "}
                  <span className="font-normal text-text/40">(اختياري)</span>
                </label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={3}
                  placeholder="اكتب أي أعراض أو معلومات تريد إبلاغ الطبيب بها..."
                  className="w-full resize-none rounded-xl border border-border bg-background px-4 py-3 font-sans text-sm text-text placeholder:text-text/30 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
                />
              </div>

              {bookingError && (
                <div className="flex items-center gap-2 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  {bookingError}
                </div>
              )}

              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setStep(1);
                    setBookingError("");
                  }}
                  className="flex-1 rounded-xl border border-border py-3 font-medium text-text transition-colors hover:bg-muted"
                >
                  رجوع
                </button>
                <button
                  onClick={handleBook}
                  disabled={isPending}
                  className="flex-1 rounded-xl bg-accent py-3 font-medium text-white transition-opacity disabled:opacity-60 hover:opacity-90"
                >
                  {isPending
                    ? "جارٍ الحجز..."
                    : selection.mode === "ORDER_BASED"
                      ? "تأكيد حجز الدور"
                      : "تأكيد الحجز"}
                </button>
              </div>
            </div>
          )}

          {/* Success */}
          {success && (
            <div className="flex flex-col items-center gap-4 py-6 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100">
                <CheckCircle className="h-8 w-8 text-emerald-600" />
              </div>
              <div>
                <p className="font-heading text-xl font-bold text-text">
                  {bookedOrder != null ? "تم حجز دورك!" : "تم الحجز بنجاح!"}
                </p>
                {bookedOrder != null ? (
                  <p className="mt-1 font-sans text-sm text-text/60">
                    رقمك في الطابور:{" "}
                    <span className="font-bold text-accent">{bookedOrder}</span>
                    <span className="mt-0.5 block text-text/50">
                      في انتظار التأكيد من العيادة
                    </span>
                  </p>
                ) : (
                  <p className="mt-1 font-sans text-sm text-text/50">
                    موعدك مع {doctor.name} في انتظار التأكيد من العيادة
                  </p>
                )}
              </div>
              <div className="flex w-full flex-col gap-2">
                <Link
                  href={appointmentsHref}
                  className="block w-full rounded-xl bg-primary py-3 text-center font-medium text-white hover:opacity-90"
                >
                  عرض مواعيدي
                </Link>
                <button
                  onClick={onClose}
                  className="w-full rounded-xl border border-border py-3 font-medium text-text hover:bg-muted"
                >
                  إغلاق
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/** Queue status + a single "join queue" action for an order-based day. */
function QueueBox({
  info,
  selected,
  onSelect,
}: {
  info: OrderInfo;
  selected: boolean;
  onSelect: () => void;
}) {
  if (!info.available) {
    return (
      <div className="flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-700">
        <AlertCircle className="h-4 w-4 shrink-0" />
        اكتمل عدد الحجوزات المتاحة لهذا اليوم
      </div>
    );
  }
  const wait = queueWait(info);
  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-lg bg-accent/5 px-3 py-2.5">
        <p className="font-sans text-sm text-text">
          سيكون دورك رقم{" "}
          <span className="font-bold text-accent">{info.nextOrderNumber}</span>
        </p>
        <div className="mt-1 flex flex-col gap-0.5 font-sans text-xs text-text/60">
          {info.expectedTime && (
            <span className="text-text/80">
              الوقت المتوقع للكشف: ~{info.expectedTime}
            </span>
          )}
          {info.currentOrder != null && (
            <span>
              {info.currentOrder > 0
                ? `يُخدَم الآن رقم ${info.currentOrder}`
                : "لم يبدأ الكشف بعد"}
            </span>
          )}
          {wait != null && <span>الانتظار التقديري: ~{wait} دقيقة</span>}
          {info.remaining != null && (
            <span>المتبقّي اليوم: {info.remaining} حجز</span>
          )}
        </div>
      </div>
      <button
        onClick={onSelect}
        className={`w-full rounded-lg border px-3 py-2.5 text-center font-sans text-sm font-medium transition-all ${
          selected
            ? "border-accent bg-accent text-white shadow-md shadow-accent/20"
            : "border-accent/40 bg-background text-accent hover:bg-accent/5"
        }`}
      >
        {selected ? "✓ تم اختيار الدور" : "احجز دوري"}
      </button>
    </div>
  );
}
