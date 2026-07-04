import React, { useEffect, useState } from "react";
import { useOutletContext, useNavigate } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import { motion, AnimatePresence } from "framer-motion";
import AppointmentDetailModal from "./AppointmentDetailModal";
import {
  Calendar,
  Users,
  Clock,
  AlertCircle,
  CheckCircle2,
  CalendarCheck,
  ArrowLeft,
} from "lucide-react";
import { startOfDay, endOfDay } from "date-fns";

const STATUS = {
  confirmed: {
    label: "مؤكد",
    cls: "bg-blue-100 text-blue-700 border border-blue-200",
  },
  completed: {
    label: "مكتمل",
    cls: "bg-green-100 text-green-700 border border-green-200",
  },
  cancelled: {
    label: "ملغي",
    cls: "bg-red-100 text-red-700 border border-red-200",
  },
};

function fmtTime(d) {
  return new Intl.DateTimeFormat("ar-EG", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(new Date(d));
}

function fmtShort(d) {
  return new Intl.DateTimeFormat("ar-EG", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(new Date(d));
}

export default function DoctorHome() {
  const { session, doctorProfile } = useOutletContext();
  const navigate = useNavigate();
  const [stats, setStats] = useState({
    today: 0,
    pending: 0,
    upcoming: 0,
    totalPatients: 0,
  });
  const [todayAppts, setTodayAppts] = useState([]);
  const [upcomingAppts, setUpcomingAppts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    if (!doctorProfile?.id) return;

    async function fetchData() {
      try {
        const { data, error } = await supabase
          .from("appointments")
          .select(
            "id, scheduled_at, status, reason, notes, users(id, full_name, phone, gender, blood_type, date_of_birth)",
          )
          .eq("doctor_id", doctorProfile.id)
          .order("scheduled_at", { ascending: true });

        if (error) throw error;
        if (!data) return;

        const now = new Date();
        const todayStart = startOfDay(now);
        const todayEnd = endOfDay(now);

        const todayList = data.filter((a) => {
          const d = new Date(a.scheduled_at);
          return d >= todayStart && d <= todayEnd && a.status !== "cancelled";
        });

        const upcomingList = data
          .filter((a) => {
            const d = new Date(a.scheduled_at);
            return d > todayEnd && ["pending", "confirmed"].includes(a.status);
          })
          .slice(0, 6);

        const pendingCount = data.filter((a) => a.status === "pending").length;
        const upcomingCount = data.filter((a) => {
          const d = new Date(a.scheduled_at);
          return d >= now && ["pending", "confirmed"].includes(a.status);
        }).length;
        const uniquePatients = new Set(
          data.map((a) => a.users?.id).filter(Boolean),
        ).size;

        setStats({
          today: todayList.length,
          pending: pendingCount,
          upcoming: upcomingCount,
          totalPatients: uniquePatients,
        });
        setTodayAppts(todayList);
        setUpcomingAppts(upcomingList);
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

  const todayStr = new Intl.DateTimeFormat("ar-EG", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(new Date());

  if (loading) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="h-20 bg-white/60 rounded-3xl" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-28 bg-white/60 rounded-2xl" />
          ))}
        </div>
        <div className="h-64 bg-white/60 rounded-3xl" />
      </div>
    );
  }

  const statCards = [
    {
      label: "مواعيد اليوم",
      value: stats.today,
      icon: <CalendarCheck size={22} />,
      gradient: "from-teal-500 to-teal-600",
    },
    {
      label: "المواعيد القادمة",
      value: stats.upcoming,
      icon: <Clock size={22} />,
      gradient: "from-blue-500 to-blue-600",
    },
    {
      label: "إجمالي المرضى",
      value: stats.totalPatients,
      icon: <Users size={22} />,
      gradient: "from-primary to-accent",
    },
  ];

  return (
    <div className="space-y-8 animate-in fade-in duration-500" dir="rtl">
      {/* ── Header ─────────────────────────────────────────── */}
      <header>
        <h1 className="text-3xl font-heading font-bold text-primary">
          مرحباً،{" "}
          <span className="text-accent">
            {doctorProfile.full_name_ar || doctorProfile.full_name}
          </span>
        </h1>
        <p className="text-text/60 font-sans mt-1">{todayStr}</p>
      </header>

      {/* ── Stats ──────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((card, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.08 }}
            className={`bg-gradient-to-br ${card.gradient} text-white p-5 rounded-2xl shadow-sm`}
          >
            <div className="bg-white/20 w-10 h-10 rounded-xl flex items-center justify-center mb-3">
              {card.icon}
            </div>
            <p className="text-3xl font-heading font-bold">{card.value}</p>
            <p className="text-sm font-sans text-white/80 mt-1">{card.label}</p>
          </motion.div>
        ))}
      </div>

      {/* ── Two-column grid ────────────────────────────────── */}
      <div className="grid lg:grid-cols-2 gap-6">
        {/* Today's Schedule */}
        <div className="bg-white rounded-3xl p-6 shadow-sm border border-primary/5">
          <div className="flex items-center justify-between mb-5">
            <h2 className="font-heading font-bold text-xl text-primary">
              جدول اليوم
            </h2>
            <span className="text-xs font-sans bg-primary/5 text-primary px-3 py-1 rounded-full">
              {stats.today} موعد
            </span>
          </div>

          {todayAppts.length === 0 ? (
            <div className="text-center py-10 text-text/40">
              <CalendarCheck size={40} className="mx-auto mb-2 opacity-40" />
              <p className="font-sans text-sm">لا توجد مواعيد اليوم</p>
            </div>
          ) : (
            <ul className="space-y-3">
              {todayAppts.map((a) => {
                const s = STATUS[a.status] || STATUS.pending;
                return (
                  <li
                    key={a.id}
                    onClick={() => setSelected(a)}
                    className="flex items-center gap-3 p-3 bg-background/50 rounded-xl border border-primary/5 cursor-pointer hover:border-accent/30 hover:bg-background transition-colors"
                  >
                    <div className="w-10 h-10 bg-accent/10 text-accent rounded-full flex items-center justify-center font-heading font-bold text-sm shrink-0">
                      {(a.users?.full_name || "؟").charAt(0)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-sans font-semibold text-sm text-primary truncate">
                        {a.users?.full_name || "مريض"}
                      </p>
                      <p className="text-xs text-text/50 font-sans">
                        {fmtTime(a.scheduled_at)}
                        {a.reason && ` · ${a.reason}`}
                      </p>
                    </div>
                    <span
                      className={`text-xs font-sans px-2 py-0.5 rounded-full border shrink-0 ${s.cls}`}
                    >
                      {s.label}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Upcoming Appointments */}
        <div className="bg-white rounded-3xl p-6 shadow-sm border border-primary/5">
          <div className="flex items-center justify-between mb-5">
            <h2 className="font-heading font-bold text-xl text-primary">
              المواعيد القادمة
            </h2>
            <button
              onClick={() => navigate("/doctor-dashboard/appointments")}
              className="text-xs font-sans text-accent hover:underline flex items-center gap-1"
            >
              عرض الكل <ArrowLeft size={12} />
            </button>
          </div>

          {upcomingAppts.length === 0 ? (
            <div className="text-center py-10 text-text/40">
              <Clock size={40} className="mx-auto mb-2 opacity-40" />
              <p className="font-sans text-sm">لا توجد مواعيد قادمة</p>
            </div>
          ) : (
            <ul className="space-y-3">
              {upcomingAppts.map((a) => {
                const s = STATUS[a.status] || STATUS.pending;
                return (
                  <li
                    key={a.id}
                    onClick={() => setSelected(a)}
                    className="flex items-center gap-3 p-3 bg-background/50 rounded-xl border border-primary/5 cursor-pointer hover:border-accent/30 hover:bg-background transition-colors"
                  >
                    <div className="w-10 h-10 bg-primary/10 text-primary rounded-full flex items-center justify-center font-heading font-bold text-sm shrink-0">
                      {(a.users?.full_name || "؟").charAt(0)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-sans font-semibold text-sm text-primary truncate">
                        {a.users?.full_name || "مريض"}
                      </p>
                      <p className="text-xs text-text/50 font-sans">
                        {fmtShort(a.scheduled_at)}
                      </p>
                    </div>
                    <span
                      className={`text-xs font-sans px-2 py-0.5 rounded-full border shrink-0 ${s.cls}`}
                    >
                      {s.label}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      {/* ── Quick CTA if pending actions ───────────────────── */}
      {stats.pending > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-amber-50 border border-amber-200 rounded-2xl p-5 flex items-center justify-between gap-4"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-amber-100 rounded-xl flex items-center justify-center shrink-0">
              <AlertCircle size={20} className="text-amber-600" />
            </div>
            <div>
              <p className="font-sans font-semibold text-amber-800">
                لديك {stats.pending} موعد بانتظار موافقتك
              </p>
              <p className="text-xs text-amber-600 font-sans">
                راجع المواعيد وتصرف بأسرع وقت.
              </p>
            </div>
          </div>
          <button
            onClick={() =>
              navigate("/doctor-dashboard/appointments?tab=pending")
            }
            className="shrink-0 px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white text-sm font-sans font-medium rounded-xl transition-colors"
          >
            مراجعة
          </button>
        </motion.div>
      )}

      {/* Appointment detail modal */}
      <AnimatePresence>
        {selected && (
          <AppointmentDetailModal
            key={selected.id}
            appointment={selected}
            doctorId={doctorProfile?.id}
            onClose={() => setSelected(null)}
            onUpdated={(id, newStatus, newNotes) => {
              // Update local lists so UI reflects change without refetch
              const update = (list) =>
                list.map((a) =>
                  a.id === id
                    ? { ...a, status: newStatus, notes: newNotes }
                    : a,
                );
              setTodayAppts((prev) => update(prev));
              setUpcomingAppts((prev) => update(prev));
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
