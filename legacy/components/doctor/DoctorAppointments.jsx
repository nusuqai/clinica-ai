import React, { useState, useEffect, useCallback } from "react";
import { useOutletContext, useSearchParams } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import { motion, AnimatePresence } from "framer-motion";
import { Loader2, Clock, Search, RefreshCw, ChevronLeft } from "lucide-react";
import AppointmentDetailModal from "./AppointmentDetailModal";

const TABS = [
  { key: "all", label: "الكل" },
  { key: "confirmed", label: "مؤكد" },
  { key: "completed", label: "مكتمل" },
  { key: "cancelled", label: "ملغي" },
];

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

// ─────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────
export default function DoctorAppointments() {
  const { doctorProfile } = useOutletContext();
  const [searchParams] = useSearchParams();
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState(searchParams.get("tab") || "all");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState(null);

  const fetchAppointments = useCallback(async () => {
    if (!doctorProfile?.id) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("appointments")
        .select(
          "id, scheduled_at, status, reason, notes, users(id, full_name, phone, gender, blood_type, date_of_birth)",
        )
        .eq("doctor_id", doctorProfile.id)
        .order("scheduled_at", { ascending: false });

      if (error) throw error;
      setAppointments(data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [doctorProfile]);

  useEffect(() => {
    fetchAppointments();

    window.addEventListener('clinica-refresh-data', fetchAppointments);

    return () => {
      window.removeEventListener('clinica-refresh-data', fetchAppointments);
    };
  }, [fetchAppointments]);

  const handleUpdated = (id, newStatus, newNotes) => {
    setAppointments((prev) =>
      prev.map((a) =>
        a.id === id ? { ...a, status: newStatus, notes: newNotes } : a,
      ),
    );
  };

  const filtered = appointments.filter((a) => {
    const matchTab = activeTab === "all" || a.status === activeTab;
    const matchSearch =
      !search ||
      (a.users?.full_name || "").toLowerCase().includes(search.toLowerCase());
    return matchTab && matchSearch;
  });

  const tabCounts = Object.fromEntries(
    TABS.map((t) => [
      t.key,
      t.key === "all"
        ? appointments.length
        : appointments.filter((a) => a.status === t.key).length,
    ]),
  );

  return (
    <div className="space-y-6 animate-in fade-in duration-500" dir="rtl">
      {/* ── Header ─────────────────────────────────────────── */}
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-heading font-bold text-primary">
            إدارة المواعيد
          </h1>
          <p className="text-text/60 font-sans text-sm mt-0.5">
            انقر على أي موعد لعرض التفاصيل واتخاذ الإجراء
          </p>
        </div>
        <button
          onClick={fetchAppointments}
          className="flex items-center gap-2 px-4 py-2 bg-white border border-primary/10 rounded-xl text-sm font-sans text-text/70 hover:bg-primary/5 transition-colors self-start"
        >
          <RefreshCw size={16} />
          تحديث
        </button>
      </header>

      {/* ── Search + Tabs ──────────────────────────────────── */}
      <div className="bg-white rounded-3xl p-4 shadow-sm border border-primary/5 space-y-4">
        <div className="relative">
          <Search
            size={16}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-text/40"
          />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="ابحث باسم المريض..."
            className="w-full pr-9 pl-4 py-2.5 font-sans text-sm bg-background/60 border border-primary/10 rounded-xl focus:outline-none focus:ring-2 focus:ring-accent/30"
          />
        </div>

        <div className="flex gap-2 flex-wrap">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key)}
              className={`px-3 py-1.5 rounded-xl text-sm font-sans font-medium transition-colors ${activeTab === t.key
                  ? "bg-primary text-white"
                  : "bg-background/60 text-text/60 hover:bg-primary/10"
                }`}
            >
              {t.label}
              <span
                className={`mr-1.5 text-xs px-1.5 py-0.5 rounded-full ${activeTab === t.key
                    ? "bg-white/20 text-white"
                    : "bg-primary/10 text-primary"
                  }`}
              >
                {tabCounts[t.key]}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* ── List ───────────────────────────────────────────── */}
      {loading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="w-8 h-8 text-accent animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-3xl p-12 text-center shadow-sm border border-primary/5">
          <Clock size={48} className="mx-auto mb-3 text-text/20" />
          <p className="font-sans text-text/50">
            لا توجد مواعيد {activeTab !== "all" ? STATUS[activeTab]?.label : ""}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((a, i) => {
            const s = STATUS[a.status] || STATUS.pending;
            return (
              <motion.div
                key={a.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.03 }}
                onClick={() => setSelected(a)}
                className="bg-white rounded-2xl p-5 shadow-sm border border-primary/5 cursor-pointer hover:border-accent/30 hover:shadow-md transition-all group"
              >
                <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                  {/* Avatar + name */}
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div className="w-11 h-11 bg-accent/10 text-accent rounded-full flex items-center justify-center font-heading font-bold text-base shrink-0 group-hover:bg-accent/20 transition-colors">
                      {(a.users?.full_name || "؟").charAt(0)}
                    </div>
                    <div className="min-w-0">
                      <p className="font-sans font-semibold text-primary truncate">
                        {a.users?.full_name || "مريض غير معروف"}
                      </p>
                      {a.users?.phone && (
                        <p className="text-xs text-text/50 font-sans">
                          {a.users.phone}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Date + reason */}
                  <div className="flex-1 min-w-0">
                    <p className="font-sans text-sm text-text/70">
                      {fmtDate(a.scheduled_at)}
                    </p>
                    {a.reason && (
                      <p className="text-xs text-text/50 font-sans mt-0.5 truncate">
                        السبب: {a.reason}
                      </p>
                    )}
                  </div>

                  {/* Status badge + chevron hint */}
                  <div className="flex items-center gap-3 shrink-0">
                    <span
                      className={`text-xs font-sans px-2.5 py-1 rounded-full border ${s.cls}`}
                    >
                      {s.label}
                    </span>
                    <ChevronLeft
                      size={16}
                      className="text-text/30 group-hover:text-accent transition-colors"
                    />
                  </div>
                </div>

                {a.notes && (
                  <p className="mt-3 pt-3 border-t border-primary/5 text-xs text-text/50 font-sans">
                    ملاحظات: {a.notes}
                  </p>
                )}
              </motion.div>
            );
          })}
        </div>
      )}

      {/* Detail Modal */}
      <AnimatePresence>
        {selected && (
          <AppointmentDetailModal
            key={selected.id}
            appointment={selected}
            doctorId={doctorProfile?.id}
            onClose={() => setSelected(null)}
            onUpdated={handleUpdated}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
