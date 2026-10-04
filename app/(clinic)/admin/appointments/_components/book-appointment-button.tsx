"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarPlus, Search, X, Loader2 } from "lucide-react";
import Modal from "@/components/admin/modal";
import {
  BookAppointmentModal,
  type BookResult,
  type Selection,
} from "@/components/landing/book-appointment-modal";
import { adminBookAppointmentAction, searchPatientsAction } from "@/server/actions/admin";
import type { PatientOption } from "@/server/services/users";
import { PHONE_EXAMPLE } from "@/lib/phone";

export interface BookableDoctor {
  id: string;
  name: string;
  specialty: string;
  fee: number | null;
}

type PatientChoice = { id: string; fullName: string } | { fullName: string; phone: string };

// Book on a patient's behalf (phone call / walk-in). Step 1 here picks the
// patient and doctor; the day/slot/queue pick + confirm reuse the patient's own
// BookAppointmentModal, wired to the admin booking action.
export default function BookAppointmentButton({ doctors }: { doctors: BookableDoctor[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [booking, setBooking] = useState<{ doctor: BookableDoctor; patient: PatientChoice } | null>(
    null
  );

  const [tab, setTab] = useState<"existing" | "new">("existing");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PatientOption[]>([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<PatientOption | null>(null);
  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [doctorId, setDoctorId] = useState("");

  // Debounced patient search.
  useEffect(() => {
    if (tab !== "existing" || selected || !query.trim()) {
      setResults([]);
      return;
    }
    let cancelled = false;
    setSearching(true);
    const t = setTimeout(() => {
      searchPatientsAction(query)
        .then((rows) => !cancelled && setResults(rows))
        .catch(() => !cancelled && setResults([]))
        .finally(() => !cancelled && setSearching(false));
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [query, tab, selected]);

  function reset() {
    setTab("existing");
    setQuery("");
    setResults([]);
    setSelected(null);
    setNewName("");
    setNewPhone("");
    setDoctorId("");
  }

  const doctor = doctors.find((d) => d.id === doctorId) ?? null;
  const patient: PatientChoice | null =
    tab === "existing"
      ? selected && { id: selected.id, fullName: selected.fullName }
      : newName.trim() && newPhone.trim()
        ? { fullName: newName.trim(), phone: newPhone.trim() }
        : null;

  function next() {
    if (!doctor || !patient) return;
    setOpen(false);
    setBooking({ doctor, patient });
  }

  async function book(selection: Selection, notes: string): Promise<BookResult> {
    if (!booking) return { ok: false };
    const res = await adminBookAppointmentAction({
      patient: booking.patient,
      doctorId: booking.doctor.id,
      ...(selection.mode === "SLOT_BASED"
        ? { slotId: selection.slot.id }
        : { date: selection.date }),
      notes: notes || undefined,
    });
    if (res.ok) router.refresh();
    return res;
  }

  const field =
    "block w-full px-4 py-2.5 font-sans text-sm border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent bg-card transition-all";
  const label = "block text-sm font-medium text-muted-foreground font-sans mb-1.5";
  const tabClass = (active: boolean) =>
    `flex-1 rounded-lg py-2 font-sans text-sm font-medium transition-colors ${
      active ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
    }`;

  return (
    <>
      <button
        onClick={() => {
          reset();
          setOpen(true);
        }}
        className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 font-sans text-sm font-medium text-white transition-colors hover:bg-primary/90"
      >
        <CalendarPlus className="h-4 w-4" />
        حجز موعد
      </button>

      <Modal open={open} onClose={() => setOpen(false)} title="حجز موعد لمريض">
        <div className="space-y-5">
          {/* Patient */}
          <div>
            <label className={label}>المريض</label>
            <div className="mb-3 flex gap-1 rounded-xl bg-muted p-1">
              <button
                type="button"
                onClick={() => setTab("existing")}
                className={tabClass(tab === "existing")}
              >
                مريض مسجّل
              </button>
              <button
                type="button"
                onClick={() => setTab("new")}
                className={tabClass(tab === "new")}
              >
                مريض جديد
              </button>
            </div>

            {tab === "existing" ? (
              selected ? (
                <div className="flex items-center justify-between rounded-xl border border-accent bg-accent/5 px-4 py-2.5">
                  <div>
                    <p className="font-sans text-sm font-medium text-foreground">
                      {selected.fullName}
                    </p>
                    {selected.phone && (
                      <p className="font-sans text-xs text-muted-foreground" dir="ltr">
                        {selected.phone}
                      </p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelected(null)}
                    aria-label="تغيير المريض"
                    className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                <>
                  <div className="relative">
                    <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <input
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder="ابحث بالاسم أو رقم الهاتف..."
                      className={`${field} pr-9`}
                      autoFocus
                    />
                  </div>
                  {query.trim() && (
                    <div className="mt-2 max-h-56 overflow-y-auto rounded-xl border border-border">
                      {searching ? (
                        <div className="flex justify-center py-4">
                          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                        </div>
                      ) : results.length === 0 ? (
                        <p className="px-4 py-3 text-center font-sans text-sm text-muted-foreground">
                          لا يوجد مريض مطابق —{" "}
                          <button
                            type="button"
                            onClick={() => setTab("new")}
                            className="font-medium text-primary hover:underline"
                          >
                            أضف مريضاً جديداً
                          </button>
                        </p>
                      ) : (
                        results.map((p) => (
                          <button
                            type="button"
                            key={p.id}
                            onClick={() => setSelected(p)}
                            className="flex w-full items-center justify-between border-b border-border px-4 py-2.5 text-start transition-colors last:border-0 hover:bg-muted/50"
                          >
                            <span className="font-sans text-sm text-foreground">{p.fullName}</span>
                            <span className="font-sans text-xs text-muted-foreground" dir="ltr">
                              {p.phone ?? "—"}
                            </span>
                          </button>
                        ))
                      )}
                    </div>
                  )}
                </>
              )
            ) : (
              <div className="space-y-3">
                <input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="الاسم الكامل"
                  className={field}
                />
                <input
                  value={newPhone}
                  onChange={(e) => setNewPhone(e.target.value)}
                  dir="ltr"
                  inputMode="numeric"
                  placeholder={PHONE_EXAMPLE}
                  className={`${field} text-start`}
                />
                <p className="font-sans text-xs text-muted-foreground">
                  إن كان الرقم مسجّلاً مسبقاً سيُحجز على حساب صاحبه.
                </p>
              </div>
            )}
          </div>

          {/* Doctor */}
          <div>
            <label className={label}>الطبيب</label>
            <select
              value={doctorId}
              onChange={(e) => setDoctorId(e.target.value)}
              className={field}
            >
              <option value="">اختر الطبيب</option>
              {doctors.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name} · {d.specialty}
                </option>
              ))}
            </select>
          </div>

          <button
            type="button"
            onClick={next}
            disabled={!doctor || !patient}
            className="w-full rounded-xl bg-primary py-2.5 font-sans text-sm font-semibold text-white transition-colors hover:bg-primary/90 disabled:opacity-50"
          >
            التالي — اختيار الموعد
          </button>
        </div>
      </Modal>

      {booking && (
        <BookAppointmentModal
          doctor={booking.doctor}
          isAuthenticated
          isPatient
          patientName={booking.patient.fullName}
          onBook={book}
          onClose={() => setBooking(null)}
        />
      )}
    </>
  );
}
