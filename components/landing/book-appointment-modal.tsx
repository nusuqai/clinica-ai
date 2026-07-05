"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { X, Clock, CheckCircle, AlertCircle, LogIn } from "lucide-react";
import Link from "next/link";
import {
  bookAppointmentAction,
  getAvailableDaysAction,
  getAvailableSlotsAction,
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

interface Props {
  doctor: Doctor;
  isAuthenticated: boolean;
  isPatient: boolean;
  onClose: () => void;
}

function formatTime(iso: string) {
  return formatSlotTime(iso, { hour: "2-digit", minute: "2-digit", hour12: true });
}

function formatDayChip(dateStr: string) {
  return {
    weekday: formatSlotDate(dateStr, { weekday: "short" }),
    day: formatSlotDate(dateStr, { day: "numeric" }),
    month: formatSlotDate(dateStr, { month: "short" }),
  };
}

export function BookAppointmentModal({
  doctor,
  isAuthenticated,
  isPatient,
  onClose,
}: Props) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const needsAuth = !isAuthenticated || !isPatient;
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [selectedDate, setSelectedDate] = useState("");
  const [availableDays, setAvailableDays] = useState<string[]>([]);
  const [daysLoading, setDaysLoading] = useState(true);
  const [daysError, setDaysError] = useState("");
  const [slots, setSlots] = useState<Slot[]>([]);
  const [selectedSlot, setSelectedSlot] = useState<Slot | null>(null);
  const [notes, setNotes] = useState("");
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [slotsError, setSlotsError] = useState("");
  const [isPending, startTransition] = useTransition();
  const [success, setSuccess] = useState(false);
  const [bookingError, setBookingError] = useState("");

  // Load doctor's available days once, up-front
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

  // Close on overlay click
  function handleOverlayClick(e: React.MouseEvent) {
    if (e.target === overlayRef.current) onClose();
  }

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  async function fetchSlots(date: string) {
    setSlotsLoading(true);
    setSlotsError("");
    setSlots([]);
    setSelectedSlot(null);
    try {
      const result = await getAvailableSlotsAction(doctor.id, date);
      setSlots(result);
      if (result.length === 0)
        setSlotsError("لا توجد مواعيد متاحة في هذا اليوم");
    } catch {
      setSlotsError("تعذر تحميل المواعيد، يرجى المحاولة مجدداً");
    } finally {
      setSlotsLoading(false);
    }
  }

  function handleDateChange(date: string) {
    setSelectedDate(date);
    if (date) fetchSlots(date);
  }

  function handleBook() {
    if (!selectedSlot) return;
    setBookingError("");
    startTransition(async () => {
      const res = await bookAppointmentAction(
        selectedSlot.id,
        notes || undefined,
      );
      if (res.ok) {
        setSuccess(true);
      } else {
        setBookingError(res.error ?? "حدث خطأ غير متوقع");
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
      <div className="relative w-full max-w-lg rounded-2xl bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
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
        <div className="px-6 py-6">
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
                  href="/login"
                  className="block w-full rounded-xl bg-primary py-3 text-center font-medium text-white transition-opacity hover:opacity-90"
                >
                  تسجيل الدخول
                </Link>
                <Link
                  href="/register"
                  className="block w-full rounded-xl border border-border py-3 text-center font-medium text-text transition-colors hover:bg-muted"
                >
                  إنشاء حساب جديد
                </Link>
              </div>
            </div>
          )}

          {/* Step 1 — Date picker */}
          {!needsAuth && step === 1 && !success && (
            <div className="flex flex-col gap-5">
              <div>
                <p className="mb-1 font-heading text-base font-bold text-text">
                  اختر يوم الموعد
                </p>
                <p className="font-sans text-sm text-text/50">
                  هذه هي الأيام المتاحة لدى الطبيب — اختر يوماً لعرض الأوقات
                  المتاحة
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
                <div className="flex gap-2 overflow-x-auto pb-1">
                  {availableDays.map((dateStr) => {
                    const { weekday, day, month } = formatDayChip(dateStr);
                    const isSelected = selectedDate === dateStr;
                    return (
                      <button
                        key={dateStr}
                        onClick={() => handleDateChange(dateStr)}
                        className={`flex shrink-0 flex-col items-center gap-0.5 rounded-xl border px-4 py-2.5 text-center transition-all ${
                          isSelected
                            ? "border-accent bg-accent text-white shadow-md shadow-accent/20"
                            : "border-border bg-background text-text hover:border-accent/50"
                        }`}
                      >
                        <span className="font-sans text-xs opacity-70">
                          {weekday}
                        </span>
                        <span className="font-heading text-base font-bold">
                          {day}
                        </span>
                        <span className="font-sans text-[11px] opacity-70">
                          {month}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Slots */}
              {slotsLoading && (
                <div className="flex items-center justify-center py-6">
                  <div className="h-6 w-6 animate-spin rounded-full border-2 border-accent border-t-transparent" />
                </div>
              )}

              {slotsError && !slotsLoading && (
                <div className="flex items-center gap-2 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  {slotsError}
                </div>
              )}

              {slots.length > 0 && (
                <div>
                  <p className="mb-3 flex items-center gap-1.5 font-sans text-sm font-medium text-text/70">
                    <Clock className="h-4 w-4" />
                    اختر وقت الموعد
                  </p>
                  <div className="grid grid-cols-3 gap-2">
                    {slots.map((slot) => (
                      <button
                        key={slot.id}
                        onClick={() => setSelectedSlot(slot)}
                        className={`rounded-xl border px-3 py-2.5 text-center font-sans text-sm font-medium transition-all ${
                          selectedSlot?.id === slot.id
                            ? "border-accent bg-accent text-white shadow-md shadow-accent/20"
                            : "border-border bg-background text-text hover:border-accent/50"
                        }`}
                      >
                        {formatTime(slot.startTime)}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {selectedSlot && (
                <button
                  onClick={() => setStep(2)}
                  className="mt-2 w-full rounded-xl bg-primary py-3 font-medium text-white transition-opacity hover:opacity-90"
                >
                  التالي — إضافة ملاحظات
                </button>
              )}
            </div>
          )}

          {/* Step 2 — Notes + confirm */}
          {!needsAuth && step === 2 && !success && (
            <div className="flex flex-col gap-5">
              {/* Summary */}
              <div className="rounded-xl bg-muted px-4 py-3">
                <p className="font-sans text-xs font-medium text-text/50">
                  تفاصيل الموعد
                </p>
                <div className="mt-2 flex flex-col gap-1">
                  <div className="flex items-center justify-between">
                    <span className="font-sans text-sm text-text/70">
                      التاريخ
                    </span>
                    <span className="font-sans text-sm font-medium text-text">
                      {formatSlotDate(selectedDate, {
                        weekday: "long",
                        year: "numeric",
                        month: "long",
                        day: "numeric",
                      })}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="font-sans text-sm text-text/70">
                      الوقت
                    </span>
                    <span className="font-sans text-sm font-medium text-text">
                      {selectedSlot && formatTime(selectedSlot.startTime)} —{" "}
                      {selectedSlot && formatTime(selectedSlot.endTime)}
                    </span>
                  </div>
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
                  {isPending ? "جارٍ الحجز..." : "تأكيد الحجز"}
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
                  تم الحجز بنجاح!
                </p>
                <p className="mt-1 font-sans text-sm text-text/50">
                  موعدك مع {doctor.name} في انتظار التأكيد من العيادة
                </p>
              </div>
              <div className="flex w-full flex-col gap-2">
                <Link
                  href="/dashboard/appointments"
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
