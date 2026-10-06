"use client";

import { useEffect, useState, useTransition } from "react";
import { X, Clock, CheckCircle, AlertCircle, LogIn, ChevronDown, Users } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { FormField } from "@/components/ui/form-field";
import {
  bookAppointmentAction,
  bookOrderAppointmentAction,
  getAvailableDaysAction,
  getAvailableSlotsAction,
  getOrderBookingInfoAction,
} from "@/server/actions/patient";
import { formatSlotDate, formatSlotTime } from "@/lib/slot-time";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";

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

type Mode = "SLOT_BASED" | "ORDER_BASED" | "ARRIVAL_BASED";

interface AvailableDay {
  date: string;
  mode: Mode;
}

interface OrderInfo {
  // "order" = number handed out now; "arrival" = number handed out at check-in.
  mode: "order" | "arrival";
  available: boolean;
  remaining: number | null;
  nextOrderNumber: number;
  currentOrder: number | null;
  estimatedDurationMin: number | null;
  expectedTime: string | null;
}

/** Per-day payload, loaded lazily when a day is opened and cached in state. */
type DayData = { kind: "slots"; slots: Slot[] } | { kind: "queue"; info: OrderInfo };

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
  const [bookedArrival, setBookedArrival] = useState(false);
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
        if (days.length === 0) setDaysError("لا توجد أيام متاحة لهذا الطبيب حالياً");
      })
      .catch(() => {
        if (!cancelled) setDaysError("تعذر تحميل الأيام المتاحة، يرجى المحاولة مجدداً");
      })
      .finally(() => {
        if (!cancelled) setDaysLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doctor.id, needsAuth]);

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
      if (mode !== "SLOT_BASED") {
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
        const res = await bookAppointmentAction(selection.slot.id, notes || undefined);
        if (res.ok) setSuccess(true);
        else setBookingError(res.error ?? "حدث خطأ غير متوقع");
      } else {
        const res = await bookOrderAppointmentAction(doctor.id, selection.date, notes || undefined);
        if (res.ok) {
          setBookedArrival(res.mode === "arrival");
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
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        showCloseButton={false}
        className="flex max-h-[90vh] w-[calc(100%-2rem)] max-w-lg flex-col gap-0 overflow-hidden rounded-2xl border-0 bg-white p-0 shadow-2xl"
      >
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-border px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary font-heading text-sm font-bold text-white">
              {initials}
            </div>
            <div>
              <DialogTitle className="font-sans text-sm font-semibold leading-normal tracking-normal text-text">
                {doctor.name}
              </DialogTitle>
              <DialogDescription className="font-sans text-xs text-text/50">
                {doctor.specialty}
              </DialogDescription>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            aria-label="إغلاق"
            className="h-10 w-10 text-text/40 hover:text-text [&_svg]:size-5"
          >
            <X />
          </Button>
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
                <p className="font-heading text-lg font-bold text-text">سجّل دخولك للمتابعة</p>
                <p className="mt-1 font-sans text-sm text-text/50">تحتاج إلى حساب مريض لحجز موعد</p>
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
                <p className="mb-1 font-heading text-base font-bold text-text">اختر يوم الموعد</p>
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
                <Alert
                  variant="destructive"
                  className="items-center border-transparent text-red-600"
                >
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  {daysError}
                </Alert>
              )}

              {!daysLoading && availableDays.length > 0 && (
                <div className="flex flex-col gap-2">
                  {availableDays.map(({ date, mode }) => {
                    const isOpen = openDate === date;
                    const data = dayData[date];
                    const loading = dayLoading[date];
                    const errorMsg = dayError[date];
                    return (
                      <div key={date} className="overflow-hidden rounded-xl border border-border">
                        {/* Day header */}
                        <Button
                          variant="ghost"
                          onClick={() => toggleDay(date, mode)}
                          className="h-auto w-full justify-between whitespace-normal rounded-none px-4 py-3 text-start font-normal text-text hover:bg-muted/60 hover:text-text [&_svg]:size-auto"
                        >
                          <span className="flex items-center gap-2">
                            <span className="font-sans text-sm font-medium text-text">
                              {formatSlotDate(date, {
                                weekday: "long",
                                day: "numeric",
                                month: "long",
                              })}
                            </span>
                            {mode !== "SLOT_BASED" && (
                              <Badge variant="accent" className="px-2 text-[11px]">
                                <Users className="h-3 w-3" />
                                {mode === "ARRIVAL_BASED" ? "أسبقية الحضور" : "طابور"}
                              </Badge>
                            )}
                          </span>
                          <ChevronDown
                            className={`h-4 w-4 shrink-0 text-text/40 transition-transform ${
                              isOpen ? "rotate-180" : ""
                            }`}
                          />
                        </Button>

                        {/* Day body — lazy content */}
                        {isOpen && (
                          <div className="border-t border-border px-4 py-3">
                            {loading && (
                              <div className="flex items-center justify-center py-4">
                                <div className="h-5 w-5 animate-spin rounded-full border-2 border-accent border-t-transparent" />
                              </div>
                            )}

                            {errorMsg && !loading && (
                              <Alert
                                variant="destructive"
                                className="items-center rounded-lg border-transparent px-3 py-2 text-red-600"
                              >
                                <AlertCircle className="h-4 w-4 shrink-0" />
                                {errorMsg}
                              </Alert>
                            )}

                            {/* Slot-based day */}
                            {!loading && data?.kind === "slots" && data.slots.length > 0 && (
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
                                      <Button
                                        key={slot.id}
                                        variant="outline"
                                        onClick={() =>
                                          setSelection({
                                            mode: "SLOT_BASED",
                                            date,
                                            slot,
                                          })
                                        }
                                        className={`h-auto rounded-lg px-3 py-2 transition-all ${
                                          isSel
                                            ? "border-accent bg-accent text-white shadow-md shadow-accent/20 hover:bg-accent"
                                            : "bg-background text-text hover:border-accent/50 hover:bg-background"
                                        }`}
                                      >
                                        {formatTime(slot.startTime)}
                                      </Button>
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
                                  selection?.mode === "ORDER_BASED" && selection.date === date
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
                <Button onClick={() => setStep(2)} className="mt-1 h-12 w-full text-base">
                  التالي — إضافة ملاحظات
                </Button>
              )}
            </div>
          )}

          {/* Step 2 — Notes + confirm */}
          {!needsAuth && step === 2 && !success && selection && (
            <div className="flex flex-col gap-5">
              {/* Summary */}
              <div className="rounded-xl bg-muted px-4 py-3">
                <p className="font-sans text-xs font-medium text-text/50">تفاصيل الموعد</p>
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
                        <span className="font-sans text-sm text-text/70">نظام الحجز</span>
                        <span className="font-sans text-sm font-medium text-text">
                          {selection.info.mode === "arrival"
                            ? "أسبقية الحضور — رقمك عند الوصول"
                            : `الدور — رقمك ${selection.info.nextOrderNumber}`}
                        </span>
                      </div>
                      {selection.info.mode !== "arrival" && selection.info.expectedTime && (
                        <div className="flex items-center justify-between">
                          <span className="font-sans text-sm text-text/70">الوقت المتوقع</span>
                          <span className="font-sans text-sm font-medium text-text">
                            ~{selection.info.expectedTime}
                          </span>
                        </div>
                      )}
                    </>
                  )}
                  {doctor.fee && (
                    <div className="flex items-center justify-between">
                      <span className="font-sans text-sm text-text/70">رسوم الكشف</span>
                      <span className="font-sans text-sm font-semibold text-accent">
                        {doctor.fee} جنيه
                      </span>
                    </div>
                  )}
                </div>
              </div>

              <FormField
                type="textarea"
                label={
                  <>
                    ملاحظات للطبيب <span className="font-normal text-text/40">(اختياري)</span>
                  </>
                }
                labelClassName="text-text"
                value={notes}
                onValueChange={setNotes}
                rows={3}
                placeholder="اكتب أي أعراض أو معلومات تريد إبلاغ الطبيب بها..."
                controlClassName="px-4 py-3 text-text placeholder:text-text/30 focus-visible:border-accent focus-visible:ring-accent/20"
              />

              {bookingError && (
                <Alert
                  variant="destructive"
                  className="items-center border-transparent text-red-600"
                >
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  {bookingError}
                </Alert>
              )}

              <div className="flex gap-3">
                <Button
                  variant="outline"
                  onClick={() => {
                    setStep(1);
                    setBookingError("");
                  }}
                  className="h-12 flex-1 text-base text-text"
                >
                  رجوع
                </Button>
                <Button
                  variant="accent"
                  onClick={handleBook}
                  loading={isPending}
                  className="h-12 flex-1 text-base"
                >
                  {isPending
                    ? "جارٍ الحجز..."
                    : selection.mode === "ORDER_BASED"
                      ? selection.info.mode === "arrival"
                        ? "تأكيد الحجز"
                        : "تأكيد حجز الدور"
                      : "تأكيد الحجز"}
                </Button>
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
                  {bookedArrival
                    ? "تم حجز مكانك!"
                    : bookedOrder != null
                      ? "تم حجز دورك!"
                      : "تم الحجز بنجاح!"}
                </p>
                {bookedArrival ? (
                  <p className="mt-1 font-sans text-sm text-text/60">
                    احضر إلى العيادة وسيتم إعطاؤك رقم دورك حسب أسبقية وصولك.
                    <span className="mt-0.5 block text-text/50">في انتظار التأكيد من العيادة</span>
                  </p>
                ) : bookedOrder != null ? (
                  <p className="mt-1 font-sans text-sm text-text/60">
                    رقمك في الطابور: <span className="font-bold text-accent">{bookedOrder}</span>
                    <span className="mt-0.5 block text-text/50">في انتظار التأكيد من العيادة</span>
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
                <Button
                  variant="outline"
                  onClick={onClose}
                  className="h-12 w-full text-base text-text"
                >
                  إغلاق
                </Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
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
      <Alert variant="warning" className="items-center rounded-lg border-transparent px-3 py-2">
        <AlertCircle className="h-4 w-4 shrink-0" />
        اكتمل عدد الحجوزات المتاحة لهذا اليوم
      </Alert>
    );
  }
  // Arrival-priority: no fixed number at booking — reception assigns it on arrival.
  if (info.mode === "arrival") {
    return (
      <div className="flex flex-col gap-3">
        <div className="rounded-lg bg-accent/5 px-3 py-2.5">
          <p className="font-sans text-sm text-text">
            احجز مكانك الآن، ويُحدَّد رقم دورك{" "}
            <span className="font-bold text-accent">عند وصولك</span> إلى العيادة حسب أسبقية الحضور.
          </p>
          <div className="mt-1 flex flex-col gap-0.5 font-sans text-xs text-text/60">
            <span>من يصل أولاً يُخدَم أولاً — لا يوجد وقت أو رقم ثابت مسبقاً.</span>
            {info.remaining != null && <span>المتبقّي اليوم: {info.remaining} مكان</span>}
          </div>
        </div>
        <Button
          variant="outline"
          onClick={onSelect}
          className={`h-auto w-full rounded-lg px-3 py-2.5 transition-all ${
            selected
              ? "border-accent bg-accent text-white shadow-md shadow-accent/20 hover:bg-accent hover:text-white"
              : "border-accent/40 bg-background text-accent hover:bg-accent/5 hover:text-accent"
          }`}
        >
          {selected ? "✓ تم اختيار الحجز" : "احجز مكاني"}
        </Button>
      </div>
    );
  }

  const wait = queueWait(info);
  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-lg bg-accent/5 px-3 py-2.5">
        <p className="font-sans text-sm text-text">
          سيكون دورك رقم <span className="font-bold text-accent">{info.nextOrderNumber}</span>
        </p>
        <div className="mt-1 flex flex-col gap-0.5 font-sans text-xs text-text/60">
          {info.expectedTime && (
            <span className="text-text/80">الوقت المتوقع للكشف: ~{info.expectedTime}</span>
          )}
          {info.currentOrder != null && (
            <span>
              {info.currentOrder > 0 ? `يُخدَم الآن رقم ${info.currentOrder}` : "لم يبدأ الكشف بعد"}
            </span>
          )}
          {wait != null && <span>الانتظار التقديري: ~{wait} دقيقة</span>}
          {info.remaining != null && <span>المتبقّي اليوم: {info.remaining} حجز</span>}
        </div>
      </div>
      <Button
        variant="outline"
        onClick={onSelect}
        className={`h-auto w-full rounded-lg px-3 py-2.5 transition-all ${
          selected
            ? "border-accent bg-accent text-white shadow-md shadow-accent/20 hover:bg-accent hover:text-white"
            : "border-accent/40 bg-background text-accent hover:bg-accent/5 hover:text-accent"
        }`}
      >
        {selected ? "✓ تم اختيار الدور" : "احجز دوري"}
      </Button>
    </div>
  );
}
