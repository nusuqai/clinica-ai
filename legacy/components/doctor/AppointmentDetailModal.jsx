import React, { useState, useEffect } from "react";
import { supabase } from "../../lib/supabase";
import { motion, AnimatePresence } from "framer-motion";
import {
  Loader2,
  CheckCircle2,
  XCircle,
  X,
  User,
  Phone,
  Droplet,
  Calendar,
  FileText,
  Activity,
  AlertTriangle,
} from "lucide-react";

const STATUS = {
  pending: {
    label: "قيد الانتظار",
    cls: "bg-amber-100 text-amber-700 border-amber-200",
  },
  confirmed: {
    label: "مؤكد",
    cls: "bg-blue-100 text-blue-700 border-blue-200",
  },
  completed: {
    label: "مكتمل",
    cls: "bg-green-100 text-green-700 border-green-200",
  },
  cancelled: { label: "ملغي", cls: "bg-red-100 text-red-700 border-red-200" },
};

const GENDER_MAP = { male: "ذكر", female: "أنثى", other: "أخرى" };

function fmtDate(d) {
  return new Intl.DateTimeFormat("ar-EG", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(new Date(d));
}

function fmtShortDate(d) {
  return new Intl.DateTimeFormat("ar-EG", {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(new Date(d));
}

/**
 * AppointmentDetailModal
 *
 * Props:
 *   appointment  – the appointment object (must include `users` relation)
 *   doctorId     – used to fetch previous completed appointments as history
 *   onClose      – () => void
 *   onUpdated    – (id, newStatus, newNotes) => void
 */
export default function AppointmentDetailModal({
  appointment,
  doctorId,
  onClose,
  onUpdated,
}) {
  const [apptHistory, setApptHistory] = useState([]);
  const [histLoading, setHistLoading] = useState(true);
  const [diagnosis, setDiagnosis] = useState("");
  const [doctorNotes, setDoctorNotes] = useState(appointment.notes || "");
  const [finalNotes, setFinalNotes] = useState(appointment.notes || "");
  const [submitting, setSubmitting] = useState(null);
  const [cancelDialog, setCancelDialog] = useState(false);
  const [formError, setFormError] = useState("");

  const patient = appointment.users || {};

  // Fetch all completed appointments between this patient and this doctor (excluding current)
  useEffect(() => {
    async function load() {
      if (!patient.id || !doctorId) {
        setHistLoading(false);
        return;
      }
      const { data } = await supabase
        .from("appointments")
        .select("id, scheduled_at, reason, notes")
        .eq("user_id", patient.id)
        .eq("doctor_id", doctorId)
        .eq("status", "completed")
        .neq("id", appointment.id)
        .order("scheduled_at", { ascending: false });

      setApptHistory(data || []);
      setHistLoading(false);
    }
    load();
  }, [patient.id, doctorId, appointment.id]);

  const handleConfirm = async () => {
    if (!diagnosis.trim()) {
      setFormError("يرجى إدخال التشخيص / السبب قبل التأكيد.");
      return;
    }
    setFormError("");
    setSubmitting("confirm");
    try {
      const { error } = await supabase
        .from("appointments")
        .update({
          status: "confirmed",
          notes: doctorNotes.trim() || null,
        })
        .eq("id", appointment.id);
      if (error) throw error;

      onUpdated(appointment.id, "confirmed", doctorNotes.trim() || null);
      onClose();
    } catch (err) {
      console.error(err);
      setFormError("حدث خطأ أثناء الحفظ. حاول مجدداً.");
    } finally {
      setSubmitting(null);
    }
  };

  const handleComplete = async () => {
    setSubmitting("complete");
    try {
      const { error } = await supabase
        .from("appointments")
        .update({ status: "completed", notes: finalNotes.trim() || null })
        .eq("id", appointment.id);
      if (error) throw error;
      onUpdated(appointment.id, "completed", finalNotes.trim() || null);
      onClose();
    } catch (err) {
      console.error(err);
    } finally {
      setSubmitting(null);
    }
  };

  const handleCancel = async () => {
    setSubmitting("cancel");
    try {
      const { error } = await supabase
        .from("appointments")
        .update({ status: "cancelled" })
        .eq("id", appointment.id);
      if (error) throw error;
      onUpdated(appointment.id, "cancelled", null);
      onClose();
    } catch (err) {
      console.error(err);
    } finally {
      setSubmitting(null);
      setCancelDialog(false);
    }
  };

  const s = STATUS[appointment.status] || STATUS.pending;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.93, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.93, opacity: 0 }}
        className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden"
        dir="rtl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="bg-primary text-white p-6 rounded-t-3xl flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center font-heading font-bold text-xl">
              {(patient.full_name || "؟").charAt(0)}
            </div>
            <div>
              <h2 className="font-heading font-bold text-lg leading-tight">
                {patient.full_name || "مريض"}
              </h2>
              <span
                className={`mt-1 inline-block text-xs font-sans px-2.5 py-0.5 rounded-full border ${s.cls}`}
              >
                {s.label}
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 bg-white/10 hover:bg-white/20 rounded-full flex items-center justify-center transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="overflow-y-auto flex-1 p-6 space-y-6">
          {/* Patient quick-info */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              {
                icon: <Phone size={14} />,
                label: "الهاتف",
                val: patient.phone || "—",
              },
              {
                icon: <User size={14} />,
                label: "الجنس",
                val: GENDER_MAP[patient.gender] || "—",
              },
              {
                icon: <Droplet size={14} />,
                label: "فصيلة الدم",
                val: patient.blood_type || "—",
              },
              {
                icon: <Calendar size={14} />,
                label: "تاريخ الميلاد",
                val: patient.date_of_birth
                  ? fmtShortDate(patient.date_of_birth)
                  : "—",
              },
            ].map((item) => (
              <div
                key={item.label}
                className="bg-background/60 rounded-2xl p-3 text-center border border-primary/5"
              >
                <div className="flex items-center justify-center gap-1 text-accent mb-1">
                  {item.icon}
                  <span className="text-xs font-sans text-text/50">
                    {item.label}
                  </span>
                </div>
                <p className="font-sans font-semibold text-sm text-primary">
                  {item.val}
                </p>
              </div>
            ))}
          </div>

          {/* Appointment details */}
          <div className="bg-background/60 rounded-2xl p-4 border border-primary/5 space-y-2">
            <h3 className="font-sans font-semibold text-sm text-text/60 flex items-center gap-2">
              <Calendar size={15} className="text-accent" /> تفاصيل الموعد
            </h3>
            <p className="font-sans text-sm text-primary">
              <span className="text-text/50">الوقت: </span>
              {fmtDate(appointment.scheduled_at)}
            </p>
            {appointment.reason && (
              <p className="font-sans text-sm text-primary">
                <span className="text-text/50">سبب الزيارة: </span>
                {appointment.reason}
              </p>
            )}
            {appointment.notes && (
              <p className="font-sans text-sm text-primary">
                <span className="text-text/50">ملاحظات: </span>
                {appointment.notes}
              </p>
            )}
          </div>

          {/* Visit history (previous completed appointments) */}
          <div>
            <h3 className="font-sans font-semibold text-sm text-text/60 flex items-center gap-2 mb-3">
              <Activity size={15} className="text-accent" /> سجل الزيارات
              السابقة
            </h3>
            {histLoading ? (
              <div className="flex items-center gap-2 text-text/40 text-sm font-sans">
                <Loader2 size={14} className="animate-spin" /> جاري التحميل...
              </div>
            ) : apptHistory.length === 0 ? (
              <div className="bg-background/60 rounded-2xl p-4 text-center border border-primary/5">
                <p className="text-sm font-sans text-text/40">
                  لا توجد زيارات مكتملة سابقة مع هذا المريض.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {apptHistory.map((h) => (
                  <div
                    key={h.id}
                    className="bg-background/60 rounded-2xl p-3 border border-primary/5"
                  >
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-xs text-text/50 font-sans">
                        {fmtShortDate(h.scheduled_at)}
                      </p>
                      <span className="text-xs font-sans px-2 py-0.5 rounded-full bg-green-100 text-green-700">
                        مكتمل
                      </span>
                    </div>
                    {h.reason && (
                      <p className="font-sans font-medium text-sm text-primary">
                        <span className="text-text/50 font-normal">
                          السبب:{" "}
                        </span>
                        {h.reason}
                      </p>
                    )}
                    {h.notes && (
                      <p className="font-sans text-sm text-text/70 mt-1">
                        <span className="text-text/50">الملاحظات: </span>
                        {h.notes}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Action form: PENDING → must enter diagnosis/reason to confirm */}
          {appointment.status === "pending" && (
            <div className="border border-blue-200 bg-blue-50 rounded-2xl p-5 space-y-4">
              <h3 className="font-sans font-semibold text-blue-800 flex items-center gap-2">
                <FileText size={16} /> تأكيد الموعد — أدخل التشخيص والملاحظات
              </h3>
              {formError && (
                <p className="text-xs font-sans text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2">
                  {formError}
                </p>
              )}
              <div>
                <label className="block text-sm font-sans font-medium text-blue-900 mb-1">
                  التشخيص / الحالة <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={diagnosis}
                  onChange={(e) => {
                    setDiagnosis(e.target.value);
                    setFormError("");
                  }}
                  placeholder="مثال: التهاب الحلق الحاد"
                  className="w-full px-4 py-2.5 font-sans text-sm bg-white border border-blue-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-300"
                />
              </div>
              <div>
                <label className="block text-sm font-sans font-medium text-blue-900 mb-1">
                  ملاحظات الطبيب (اختياري)
                </label>
                <textarea
                  rows={3}
                  value={doctorNotes}
                  onChange={(e) => setDoctorNotes(e.target.value)}
                  placeholder="أي تعليمات أو ملاحظات إضافية للمريض..."
                  className="w-full px-4 py-2.5 font-sans text-sm bg-white border border-blue-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-300 resize-none"
                />
              </div>
              <div className="flex gap-3 pt-1">
                <button
                  onClick={handleConfirm}
                  disabled={!!submitting}
                  className="flex-1 flex items-center justify-center gap-2 py-3 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white rounded-xl font-sans font-medium transition-colors"
                >
                  {submitting === "confirm" ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <CheckCircle2 size={16} />
                  )}
                  تأكيد الموعد
                </button>
                <button
                  onClick={() => setCancelDialog(true)}
                  disabled={!!submitting}
                  className="flex items-center justify-center gap-2 px-5 py-3 bg-red-50 hover:bg-red-100 text-red-700 rounded-xl font-sans font-medium transition-colors disabled:opacity-60"
                >
                  <XCircle size={16} /> رفض
                </button>
              </div>
            </div>
          )}

          {/* Action form: CONFIRMED → complete with final notes */}
          {appointment.status === "confirmed" && (
            <div className="border border-green-200 bg-green-50 rounded-2xl p-5 space-y-4">
              <h3 className="font-sans font-semibold text-green-800 flex items-center gap-2">
                <FileText size={16} /> إتمام الموعد — أضف الملاحظات الختامية
              </h3>
              <div>
                <label className="block text-sm font-sans font-medium text-green-900 mb-1">
                  ملاحظات ختامية (اختياري)
                </label>
                <textarea
                  rows={3}
                  value={finalNotes}
                  onChange={(e) => setFinalNotes(e.target.value)}
                  placeholder="الخلاصة، الدواء الموصوف، موعد المتابعة..."
                  className="w-full px-4 py-2.5 font-sans text-sm bg-white border border-green-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-300 resize-none"
                />
              </div>
              <div className="flex gap-3">
                <button
                  onClick={handleComplete}
                  disabled={!!submitting}
                  className="flex-1 flex items-center justify-center gap-2 py-3 bg-green-600 hover:bg-green-700 disabled:opacity-60 text-white rounded-xl font-sans font-medium transition-colors"
                >
                  {submitting === "complete" ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <CheckCircle2 size={16} />
                  )}
                  إتمام الموعد
                </button>
                <button
                  onClick={() => setCancelDialog(true)}
                  disabled={!!submitting}
                  className="flex items-center justify-center gap-2 px-5 py-3 bg-red-50 hover:bg-red-100 text-red-700 rounded-xl font-sans font-medium transition-colors disabled:opacity-60"
                >
                  <XCircle size={16} /> إلغاء
                </button>
              </div>
            </div>
          )}
        </div>
      </motion.div>

      {/* Inner cancel confirmation dialog */}
      <AnimatePresence>
        {cancelDialog && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[60] flex items-center justify-center p-4"
            onClick={() => setCancelDialog(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-3xl p-8 max-w-sm w-full shadow-2xl text-center"
              dir="rtl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="w-14 h-14 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <AlertTriangle size={28} className="text-red-600" />
              </div>
              <h3 className="font-heading font-bold text-xl text-primary mb-2">
                تأكيد الرفض / الإلغاء
              </h3>
              <p className="font-sans text-text/60 text-sm mb-6">
                هل أنت متأكد من إلغاء هذا الموعد؟ لا يمكن التراجع عن هذا
                الإجراء.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={handleCancel}
                  disabled={submitting === "cancel"}
                  className="flex-1 flex items-center justify-center gap-2 py-3 bg-red-500 hover:bg-red-600 disabled:opacity-60 text-white rounded-xl font-sans font-medium transition-colors"
                >
                  {submitting === "cancel" && (
                    <Loader2 size={16} className="animate-spin" />
                  )}
                  نعم، إلغاء الموعد
                </button>
                <button
                  onClick={() => setCancelDialog(false)}
                  className="flex-1 py-3 bg-background hover:bg-primary/5 text-text/70 rounded-xl font-sans font-medium transition-colors"
                >
                  تراجع
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
