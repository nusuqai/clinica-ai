import React, { useState, useEffect, useMemo } from "react";
import { useOutletContext } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import {
  Calendar,
  Plus,
  Clock,
  Trash2,
  Loader2,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  X,
  CheckCircle2,
} from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";

/* ────────────────────────────────────────────────────
   Custom Confirm Modal
   ──────────────────────────────────────────────────── */
function ConfirmModal({ open, title, message, confirmLabel, onConfirm, onCancel, loading }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" dir="rtl">
      <div className="fixed inset-0 bg-black/40 backdrop-blur-sm" onClick={onCancel} />
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="relative bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6 z-10"
      >
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 bg-red-100 rounded-xl flex items-center justify-center shrink-0">
            <AlertTriangle size={20} className="text-red-500" />
          </div>
          <h3 className="font-heading font-bold text-lg text-primary">{title}</h3>
        </div>
        <p className="text-sm font-sans text-text/70 mb-6">{message}</p>
        <div className="flex gap-3">
          <button
            onClick={onConfirm}
            disabled={loading}
            className="flex-1 px-4 py-2.5 bg-red-500 hover:bg-red-600 text-white font-sans font-medium rounded-xl transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {loading && <Loader2 size={16} className="animate-spin" />}
            {confirmLabel || "تأكيد"}
          </button>
          <button
            onClick={onCancel}
            disabled={loading}
            className="flex-1 px-4 py-2.5 bg-background hover:bg-background/80 text-primary font-sans font-medium rounded-xl transition-colors border border-primary/10"
          >
            إلغاء
          </button>
        </div>
      </motion.div>
    </div>
  );
}

/* ────────────────────────────────────────────────────
   Toast notification
   ──────────────────────────────────────────────────── */
function Toast({ message, type, onClose }) {
  useEffect(() => {
    const t = setTimeout(onClose, 3000);
    return () => clearTimeout(t);
  }, [onClose]);

  const bg = type === "error" ? "bg-red-500" : "bg-green-500";
  const Icon = type === "error" ? AlertTriangle : CheckCircle2;

  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 30 }}
      className={`fixed bottom-6 left-6 z-50 ${bg} text-white px-5 py-3 rounded-xl shadow-lg flex items-center gap-3 font-sans text-sm`}
    >
      <Icon size={18} />
      {message}
      <button onClick={onClose} className="mr-2 hover:opacity-70">
        <X size={14} />
      </button>
    </motion.div>
  );
}

/* ────────────────────────────────────────────────────
   Main Component
   ──────────────────────────────────────────────────── */
export default function DoctorAvailability() {
  const { doctorProfile } = useOutletContext();
  const [slots, setSlots] = useState([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [newDate, setNewDate] = useState("");
  const [newStartTime, setNewStartTime] = useState("");
  const [newEndTime, setNewEndTime] = useState("");
  const [error, setError] = useState(null);

  // Confirm modal state
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmTarget, setConfirmTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  // Toast state
  const [toast, setToast] = useState(null);

  // Expanded day groups
  const [expandedDays, setExpandedDays] = useState(new Set());

  useEffect(() => {
    if (!doctorProfile?.id) return;
    fetchSlots();

    window.addEventListener('clinica-refresh-data', fetchSlots);

    return () => {
      window.removeEventListener('clinica-refresh-data', fetchSlots);
    };
  }, [doctorProfile]);

  async function fetchSlots() {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("time_slots")
        .select("*")
        .eq("doctor_id", doctorProfile.id)
        .gte("starts_at", new Date().toISOString())
        .order("starts_at", { ascending: true });

      if (error) throw error;
      setSlots(data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  // Group slots by date
  const groupedSlots = useMemo(() => {
    const groups = {};
    for (const slot of slots) {
      const d = new Date(slot.starts_at);
      const dateKey = d.toLocaleDateString("en-CA"); // YYYY-MM-DD
      if (!groups[dateKey]) {
        groups[dateKey] = {
          dateKey,
          dayLabel: d.toLocaleDateString("ar-EG", {
            weekday: "long",
            year: "numeric",
            month: "long",
            day: "numeric",
          }),
          slots: [],
        };
      }
      groups[dateKey].slots.push(slot);
    }
    return Object.values(groups);
  }, [slots]);

  function toggleDay(dateKey) {
    setExpandedDays((prev) => {
      const next = new Set(prev);
      if (next.has(dateKey)) next.delete(dateKey);
      else next.add(dateKey);
      return next;
    });
  }

  async function handleAddSlot(e) {
    e.preventDefault();
    setError(null);
    if (!newDate || !newStartTime || !newEndTime) {
      setError("الرجاء تعبئة جميع الحقول");
      return;
    }

    const startDateTime = new Date(`${newDate}T${newStartTime}`);
    const endDateTime = new Date(`${newDate}T${newEndTime}`);

    if (isNaN(startDateTime.getTime()) || isNaN(endDateTime.getTime())) {
      setError("تاريخ أو وقت غير صالح");
      return;
    }

    if (endDateTime <= startDateTime) {
      setError("وقت النهاية يجب أن يكون بعد وقت البداية");
      return;
    }

    if (startDateTime < new Date()) {
      setError("لا يمكن إضافة موعد في الماضي");
      return;
    }

    setAdding(true);
    try {
      const { error } = await supabase.from("time_slots").insert({
        doctor_id: doctorProfile.id,
        starts_at: startDateTime.toISOString(),
        ends_at: endDateTime.toISOString(),
        is_booked: false,
      });

      if (error) throw error;

      setNewDate("");
      setNewStartTime("");
      setNewEndTime("");
      setToast({ message: "تم إضافة الموعد المتاح بنجاح", type: "success" });
      fetchSlots();
    } catch (err) {
      setError(err.message);
    } finally {
      setAdding(false);
    }
  }

  function requestDelete(slot) {
    setConfirmTarget(slot);
    setConfirmOpen(true);
  }

  async function confirmDelete() {
    if (!confirmTarget) return;
    setDeleting(true);
    try {
      const { error } = await supabase
        .from("time_slots")
        .delete()
        .eq("id", confirmTarget.id);
      if (error) throw error;
      setSlots((prev) => prev.filter((s) => s.id !== confirmTarget.id));
      setToast({ message: "تم حذف الموعد بنجاح", type: "success" });
    } catch (err) {
      console.error(err);
      setToast({ message: "حدث خطأ أثناء الحذف", type: "error" });
    } finally {
      setDeleting(false);
      setConfirmOpen(false);
      setConfirmTarget(null);
    }
  }

  const todayStr = new Date().toISOString().split("T")[0];

  return (
    <div className="space-y-8 animate-in fade-in duration-500" dir="rtl">
      <header>
        <h1 className="text-3xl font-heading font-bold text-primary">
          أوقات الدوام
        </h1>
        <p className="text-text/60 font-sans mt-1">
          أضف الأوقات التي تكون متاحاً فيها لاستقبال المرضى.
        </p>
      </header>

      {/* ── Add Slot Form ────────────────────────────────── */}
      <div className="bg-white rounded-3xl p-6 shadow-sm border border-primary/5">
        <h2 className="font-heading font-bold text-xl text-primary mb-5 flex items-center gap-2">
          <Plus size={20} className="text-accent" />
          إضافة موعد متاح جديد
        </h2>

        <form onSubmit={handleAddSlot} className="flex flex-wrap items-end gap-4">
          <div className="flex-1 min-w-[180px]">
            <label className="block text-sm font-sans mb-1.5 text-primary font-medium">
              التاريخ
            </label>
            <input
              type="date"
              className="w-full px-4 py-2.5 border border-primary/15 rounded-xl font-sans focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent bg-background/50 transition-all"
              value={newDate}
              onChange={(e) => setNewDate(e.target.value)}
              min={todayStr}
              required
            />
          </div>
          <div className="w-36">
            <label className="block text-sm font-sans mb-1.5 text-primary font-medium">
              من الساعة
            </label>
            <input
              type="time"
              className="w-full px-4 py-2.5 border border-primary/15 rounded-xl font-sans focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent bg-background/50 transition-all"
              value={newStartTime}
              onChange={(e) => setNewStartTime(e.target.value)}
              required
            />
          </div>
          <div className="w-36">
            <label className="block text-sm font-sans mb-1.5 text-primary font-medium">
              إلى الساعة
            </label>
            <input
              type="time"
              className="w-full px-4 py-2.5 border border-primary/15 rounded-xl font-sans focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent bg-background/50 transition-all"
              value={newEndTime}
              onChange={(e) => setNewEndTime(e.target.value)}
              required
            />
          </div>
          <button
            type="submit"
            disabled={adding}
            className="h-[42px] px-6 bg-accent hover:bg-accent/90 text-primary font-sans font-bold rounded-xl flex items-center gap-2 transition-colors disabled:opacity-50 shadow-sm"
          >
            {adding ? (
              <Loader2 size={18} className="animate-spin" />
            ) : (
              <Plus size={18} />
            )}
            إضافة
          </button>
        </form>
        {error && (
          <p className="text-red-500 text-sm mt-3 font-sans flex items-center gap-1">
            <AlertTriangle size={14} />
            {error}
          </p>
        )}
      </div>

      {/* ── Slots grouped by day ─────────────────────────── */}
      <div className="bg-white rounded-3xl p-6 shadow-sm border border-primary/5">
        <div className="flex items-center justify-between mb-5">
          <h2 className="font-heading font-bold text-xl text-primary flex items-center gap-2">
            <Calendar size={20} className="text-accent" />
            الأوقات المتاحة القادمة
          </h2>
          <span className="text-xs font-sans bg-primary/5 text-primary px-3 py-1 rounded-full">
            {slots.length} موعد
          </span>
        </div>

        {loading ? (
          <div className="flex justify-center p-10">
            <Loader2 className="animate-spin text-accent" size={28} />
          </div>
        ) : groupedSlots.length === 0 ? (
          <div className="text-center py-14 text-text/40">
            <Clock size={44} className="mx-auto mb-3 opacity-40" />
            <p className="font-sans text-sm">لا توجد أوقات متاحة مضافة بعد.</p>
            <p className="font-sans text-xs mt-1 text-text/30">
              أضف أوقاتك من النموذج أعلاه.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {groupedSlots.map((group) => {
              const isExpanded = expandedDays.has(group.dateKey);
              const bookedCount = group.slots.filter((s) => s.is_booked).length;
              const availableCount = group.slots.length - bookedCount;

              return (
                <div
                  key={group.dateKey}
                  className="border border-primary/8 rounded-2xl overflow-hidden transition-colors hover:border-accent/20"
                >
                  {/* Day header — always visible */}
                  <button
                    onClick={() => toggleDay(group.dateKey)}
                    className="w-full flex items-center justify-between px-5 py-4 bg-background/40 hover:bg-background/70 transition-colors text-right"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 bg-accent/10 text-accent rounded-lg flex items-center justify-center shrink-0">
                        <Calendar size={16} />
                      </div>
                      <div>
                        <p className="font-sans font-bold text-primary text-sm">
                          {group.dayLabel}
                        </p>
                        <p className="text-xs font-sans text-text/50 mt-0.5">
                          <span className="text-green-600">{availableCount} متاح</span>
                          {bookedCount > 0 && (
                            <span className="text-red-500 mr-2">
                              · {bookedCount} محجوز
                            </span>
                          )}
                        </p>
                      </div>
                    </div>
                    <div className="text-text/40">
                      {isExpanded ? (
                        <ChevronUp size={18} />
                      ) : (
                        <ChevronDown size={18} />
                      )}
                    </div>
                  </button>

                  {/* Expanded slot list */}
                  <AnimatePresence>
                    {isExpanded && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden"
                      >
                        <div className="px-5 pb-4 pt-1">
                          <table className="w-full">
                            <thead>
                              <tr className="text-xs font-sans text-text/40 border-b border-primary/5">
                                <th className="text-right py-2 font-medium">
                                  الوقت
                                </th>
                                <th className="text-center py-2 font-medium">
                                  الحالة
                                </th>
                                <th className="text-left py-2 font-medium w-12"></th>
                              </tr>
                            </thead>
                            <tbody>
                              {group.slots.map((slot) => {
                                const start = new Date(slot.starts_at);
                                const end = new Date(slot.ends_at);
                                const startStr = start.toLocaleTimeString(
                                  "ar-EG",
                                  {
                                    hour: "numeric",
                                    minute: "2-digit",
                                    hour12: true,
                                  }
                                );
                                const endStr = end.toLocaleTimeString(
                                  "ar-EG",
                                  {
                                    hour: "numeric",
                                    minute: "2-digit",
                                    hour12: true,
                                  }
                                );

                                return (
                                  <tr
                                    key={slot.id}
                                    className="border-b last:border-0 border-primary/5 hover:bg-background/30 transition-colors"
                                  >
                                    <td className="py-2.5 text-sm font-sans text-primary flex items-center gap-2">
                                      <Clock
                                        size={13}
                                        className="text-accent/60"
                                      />
                                      {startStr} — {endStr}
                                    </td>
                                    <td className="py-2.5 text-center">
                                      {slot.is_booked ? (
                                        <span className="text-[11px] bg-red-100 text-red-700 px-2.5 py-0.5 rounded-full border border-red-200 font-sans">
                                          محجوز
                                        </span>
                                      ) : (
                                        <span className="text-[11px] bg-green-100 text-green-700 px-2.5 py-0.5 rounded-full border border-green-200 font-sans">
                                          متاح
                                        </span>
                                      )}
                                    </td>
                                    <td className="py-2.5 text-left">
                                      {!slot.is_booked && (
                                        <button
                                          onClick={() => requestDelete(slot)}
                                          className="text-red-400 hover:text-red-600 hover:bg-red-50 p-1.5 rounded-lg transition-colors"
                                          title="حذف"
                                        >
                                          <Trash2 size={15} />
                                        </button>
                                      )}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Confirm Delete Modal ─────────────────────────── */}
      <AnimatePresence>
        <ConfirmModal
          open={confirmOpen}
          title="حذف الموعد المتاح"
          message="هل أنت متأكد من حذف هذا الموعد؟ لن يتمكن المرضى من حجزه بعد الحذف."
          confirmLabel="حذف"
          onConfirm={confirmDelete}
          onCancel={() => {
            setConfirmOpen(false);
            setConfirmTarget(null);
          }}
          loading={deleting}
        />
      </AnimatePresence>

      {/* ── Toast ────────────────────────────────────────── */}
      <AnimatePresence>
        {toast && (
          <Toast
            message={toast.message}
            type={toast.type}
            onClose={() => setToast(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
