import React, { useState, useEffect } from "react";
import { useOutletContext } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import { motion, AnimatePresence } from "framer-motion";
import { Loader2, X, Phone, Calendar, Users } from "lucide-react";

const STATUS = {
  pending: { label: "قيد الانتظار", cls: "bg-amber-100 text-amber-700" },
  confirmed: { label: "مؤكد", cls: "bg-blue-100 text-blue-700" },
  completed: { label: "مكتمل", cls: "bg-green-100 text-green-700" },
  cancelled: { label: "ملغي", cls: "bg-red-100 text-red-700" },
};

export default function DoctorPatients() {
  const { doctorProfile } = useOutletContext();
  const [patients, setPatients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!doctorProfile?.id) return;

    async function fetchData() {
      try {
        const { data, error } = await supabase
          .from("appointments")
          .select(
            "id, scheduled_at, status, reason, users(id, full_name, phone, gender, blood_type)",
          )
          .eq("doctor_id", doctorProfile.id)
          .order("scheduled_at", { ascending: false });

        if (error) throw error;

        // Group appointments by patient
        const patientMap = new Map();
        for (const appt of data || []) {
          const uid = appt.users?.id;
          if (!uid) continue;
          if (!patientMap.has(uid)) {
            patientMap.set(uid, { ...appt.users, appointments: [] });
          }
          patientMap.get(uid).appointments.push({
            id: appt.id,
            scheduled_at: appt.scheduled_at,
            status: appt.status,
            reason: appt.reason,
          });
        }

        setPatients(Array.from(patientMap.values()));
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }

    fetchData();

    window.addEventListener('clinica-refresh-data', fetchData);

    return () => {
      window.removeEventListener('clinica-refresh-data', fetchData);
    };
  }, [doctorProfile]);

  const filtered = patients.filter(
    (p) =>
      !search ||
      (p.full_name || "").toLowerCase().includes(search.toLowerCase()),
  );

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="w-8 h-8 text-accent animate-spin" />
      </div>
    );
  }

  const fmtDate = (d) =>
    new Intl.DateTimeFormat("ar-EG", {
      year: "numeric",
      month: "short",
      day: "numeric",
    }).format(new Date(d));

  const fmtFull = (d) =>
    new Intl.DateTimeFormat("ar-EG", {
      weekday: "short",
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    }).format(new Date(d));

  return (
    <div className="space-y-6 animate-in fade-in duration-500" dir="rtl">
      {/* ── Header ─────────────────────────────────────────── */}
      <header>
        <h1 className="text-2xl font-heading font-bold text-primary">
          قائمة المرضى
        </h1>
        <p className="text-text/60 font-sans text-sm mt-0.5">
          {patients.length} مريض فريد حتى الآن
        </p>
      </header>

      {/* ── Search ─────────────────────────────────────────── */}
      <div className="relative">
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-text/40 pointer-events-none">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.3-4.3" />
          </svg>
        </span>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="ابحث باسم المريض..."
          className="w-full pr-9 pl-4 py-2.5 font-sans text-sm bg-white border border-primary/10 rounded-xl focus:outline-none focus:ring-2 focus:ring-accent/30 shadow-sm"
        />
      </div>

      {/* ── Grid ───────────────────────────────────────────── */}
      {filtered.length === 0 ? (
        <div className="bg-white rounded-3xl p-12 text-center shadow-sm border border-primary/5">
          <Users size={48} className="mx-auto mb-3 text-text/20" />
          <p className="font-sans text-text/50">لا يوجد مرضى</p>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((p, i) => {
            const lastAppt = p.appointments[0]; // already sorted desc
            const completedCount = p.appointments.filter(
              (a) => a.status === "completed",
            ).length;

            return (
              <motion.div
                key={p.id}
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
                className="bg-white rounded-2xl p-5 shadow-sm border border-primary/5 cursor-pointer hover:border-accent/30 hover:shadow-md transition-all group"
                onClick={() => setSelected(p)}
              >
                {/* Avatar + name */}
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-12 h-12 bg-accent/10 text-accent rounded-full flex items-center justify-center font-heading font-bold text-lg shrink-0 group-hover:bg-accent/20 transition-colors">
                    {(p.full_name || "؟").charAt(0)}
                  </div>
                  <div className="min-w-0">
                    <p className="font-sans font-semibold text-primary truncate">
                      {p.full_name}
                    </p>
                    {p.phone && (
                      <p className="text-xs text-text/50 font-sans flex items-center gap-1 mt-0.5">
                        <Phone size={10} /> {p.phone}
                      </p>
                    )}
                  </div>
                </div>

                {/* Mini stats */}
                <div className="grid grid-cols-2 gap-2 text-center">
                  <div className="bg-background/70 rounded-xl p-2">
                    <p className="font-heading font-bold text-primary text-xl">
                      {p.appointments.length}
                    </p>
                    <p className="text-xs text-text/50 font-sans">إجمالي</p>
                  </div>
                  <div className="bg-background/70 rounded-xl p-2">
                    <p className="font-heading font-bold text-green-600 text-xl">
                      {completedCount}
                    </p>
                    <p className="text-xs text-text/50 font-sans">مكتمل</p>
                  </div>
                </div>

                {/* Last visit */}
                {lastAppt && (
                  <div className="mt-3 pt-3 border-t border-primary/5 flex items-center justify-between">
                    <p className="text-xs text-text/50 font-sans">
                      آخر زيارة: {fmtDate(lastAppt.scheduled_at)}
                    </p>
                    <span
                      className={`text-xs font-sans px-2 py-0.5 rounded-full ${STATUS[lastAppt.status]?.cls || ""}`}
                    >
                      {STATUS[lastAppt.status]?.label || lastAppt.status}
                    </span>
                  </div>
                )}
              </motion.div>
            );
          })}
        </div>
      )}

      {/* ── Patient Detail Modal ───────────────────────────── */}
      <AnimatePresence>
        {selected && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={() => setSelected(null)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-3xl shadow-2xl w-full max-w-lg max-h-[85vh] overflow-hidden flex flex-col"
              dir="rtl"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Modal header */}
              <div className="p-6 border-b border-primary/5 flex items-center justify-between bg-primary text-white rounded-t-3xl">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center font-heading font-bold text-xl">
                    {(selected.full_name || "؟").charAt(0)}
                  </div>
                  <div>
                    <h3 className="font-heading font-bold text-lg">
                      {selected.full_name}
                    </h3>
                    {selected.phone && (
                      <p className="text-white/70 text-sm flex items-center gap-1 font-sans">
                        <Phone size={12} /> {selected.phone}
                      </p>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => setSelected(null)}
                  className="w-8 h-8 bg-white/10 rounded-full flex items-center justify-center hover:bg-white/20 transition-colors"
                >
                  <X size={18} />
                </button>
              </div>

              {/* Quick stats in modal */}
              <div className="grid grid-cols-3 gap-3 p-4 bg-background/40 border-b border-primary/5">
                {[
                  {
                    label: "إجمالي المواعيد",
                    val: selected.appointments.length,
                  },
                  {
                    label: "مكتملة",
                    val: selected.appointments.filter(
                      (a) => a.status === "completed",
                    ).length,
                  },
                  {
                    label: "ملغاة",
                    val: selected.appointments.filter(
                      (a) => a.status === "cancelled",
                    ).length,
                  },
                ].map((stat) => (
                  <div
                    key={stat.label}
                    className="bg-white rounded-xl p-3 text-center shadow-sm"
                  >
                    <p className="font-heading font-bold text-primary text-2xl">
                      {stat.val}
                    </p>
                    <p className="text-xs text-text/50 font-sans mt-0.5">
                      {stat.label}
                    </p>
                  </div>
                ))}
              </div>

              {/* Appointment history */}
              <div className="overflow-y-auto flex-1 p-5 space-y-3">
                <h4 className="font-sans font-semibold text-sm text-text/60 mb-2">
                  سجل المواعيد ({selected.appointments.length})
                </h4>
                {selected.appointments.map((a) => {
                  const s = STATUS[a.status] || STATUS.pending;
                  return (
                    <div
                      key={a.id}
                      className="flex items-start gap-3 p-3 bg-background/50 rounded-xl border border-primary/5"
                    >
                      <Calendar
                        size={16}
                        className="text-accent shrink-0 mt-0.5"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="font-sans text-sm text-primary">
                          {fmtFull(a.scheduled_at)}
                        </p>
                        {a.reason && (
                          <p className="text-xs text-text/50 font-sans truncate mt-0.5">
                            السبب: {a.reason}
                          </p>
                        )}
                      </div>
                      <span
                        className={`text-xs font-sans px-2.5 py-1 rounded-full shrink-0 ${s.cls}`}
                      >
                        {s.label}
                      </span>
                    </div>
                  );
                })}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
