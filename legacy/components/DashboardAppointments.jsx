import React, { useEffect, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { CalendarIcon, Clock, UserIcon, Info } from "lucide-react";

export default function DashboardAppointments() {
  const { session } = useOutletContext();
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchAppointments() {
      try {
        const { data, error } = await supabase
          .from("appointments")
          .select("*, doctors(full_name, specialty, photo_url)")
          .eq("user_id", session.user.id)
          .order("scheduled_at", { ascending: true }); // Ideally descending for past, ascending for future, but sorting in JS

        if (error) throw error;
        setAppointments(data);
      } catch (err) {
        console.error("Error fetching appointments:", err);
      } finally {
        setLoading(false);
      }
    }

    if (session?.user?.id) {
      fetchAppointments();
      window.addEventListener('clinica-refresh-data', fetchAppointments);
    }

    return () => {
      window.removeEventListener('clinica-refresh-data', fetchAppointments);
    };
  }, [session]);

  const now = new Date();
  const upcoming = appointments.filter((a) => new Date(a.scheduled_at) >= now);
  const past = appointments
    .filter((a) => new Date(a.scheduled_at) < now)
    .sort((a, b) => new Date(b.scheduled_at) - new Date(a.scheduled_at));

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return new Intl.DateTimeFormat("ar-EG", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    }).format(date);
  };

  const formatTime = (dateString) => {
    const date = new Date(dateString);
    return new Intl.DateTimeFormat("ar-EG", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    }).format(date);
  };

  const statusMap = {
    pending: { label: "قيد الانتظار", color: "bg-yellow-100 text-yellow-800" },
    confirmed: { label: "مؤكد", color: "bg-green-100 text-green-800" },
    cancelled: { label: "ملغي", color: "bg-red-100 text-red-800" },
    completed: { label: "مكتمل", color: "bg-blue-100 text-blue-800" },
  };

  const AppointmentCard = ({ apt, isPast }) => {
    const status = statusMap[apt.status] || statusMap["pending"];
    // For demo purposes, we randomly render an avatar if missing to keep the UI rich
    const doctorAvatar =
      apt.doctors?.photo_url ||
      `https://ui-avatars.com/api/?name=${encodeURIComponent(apt.doctors?.full_name || "طبيب")}&background=00C2CB&color=fff`;

    return (
      <div
        className={`bg-white rounded-3xl p-6 shadow-sm border ${isPast ? "border-primary/5 opacity-80" : "border-accent/20"} flex flex-col md:flex-row gap-6 items-start md:items-center justify-between transition-all hover:shadow-md`}
      >
        {/* Doctor Info */}
        <div className="flex items-center gap-4 w-full md:w-auto">
          <img
            src={doctorAvatar}
            alt={apt.doctors?.full_name}
            className="w-16 h-16 rounded-2xl object-cover shrink-0"
          />
          <div>
            <h3 className="font-heading font-bold text-lg text-primary">
              {apt.doctors?.full_name}
            </h3>
            <p className="font-sans text-sm text-text/60">
              {apt.doctors?.specialty}
            </p>
          </div>
        </div>

        {/* DateTime Info */}
        <div className="flex flex-col gap-2 w-full md:w-auto bg-background/50 rounded-xl p-3 md:p-0 md:bg-transparent">
          <div className="flex items-center gap-2 text-primary font-sans font-medium">
            <CalendarIcon size={18} className="text-accent" />
            <span>{formatDate(apt.scheduled_at)}</span>
          </div>
          <div className="flex items-center gap-2 text-text/70 font-sans text-sm">
            <Clock size={16} className="text-accent" />
            <span>{formatTime(apt.scheduled_at)}</span>
          </div>
        </div>

        {/* Status & Actions */}
        <div className="flex items-center justify-between md:justify-end gap-4 w-full md:w-auto">
          <span
            className={`px-4 py-1.5 rounded-full font-sans text-xs font-bold ${status.color}`}
          >
            {status.label}
          </span>

          {!isPast &&
            apt.status !== "cancelled" &&
            apt.status !== "completed" && (
              <button className="text-red-500 hover:text-red-700 hover:bg-red-50 px-3 py-1.5 rounded-lg transition-colors font-sans text-sm font-medium">
                إلغاء الموعد
              </button>
            )}
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="space-y-6">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="animate-pulse bg-white/50 h-32 rounded-3xl border border-primary/5"
          />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-10 animate-in fade-in zoom-in-95 duration-500">
      <header>
        <h1 className="text-3xl font-heading font-bold text-primary mb-2">
          مواعيدي
        </h1>
        <p className="text-text/60 font-sans">
          إدارة جميع حجوزاتك ومواعيدك الطبية.
        </p>
      </header>

      {/* Upcoming */}
      <section>
        <h2 className="font-heading font-bold text-xl text-primary mb-4 flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-accent animate-pulse" />
          المواعيد القادمة
        </h2>
        {upcoming.length > 0 ? (
          <div className="space-y-4">
            {upcoming.map((apt) => (
              <AppointmentCard key={apt.id} apt={apt} isPast={false} />
            ))}
          </div>
        ) : (
          <div className="bg-white/50 rounded-3xl p-10 text-center border border-primary/5">
            <CalendarIcon size={40} className="mx-auto text-text/20 mb-3" />
            <p className="font-sans text-text/60">
              عظيم! تم الانتهاء من جميع مواعيدك. لا يوجد مواعيد قادمة.
            </p>
          </div>
        )}
      </section>

      {/* Past */}
      <section>
        <h2 className="font-heading font-bold text-xl text-primary/70 mb-4 border-t border-primary/10 pt-8">
          المواعيد السابقة
        </h2>
        {past.length > 0 ? (
          <div className="space-y-4">
            {past.map((apt) => (
              <AppointmentCard key={apt.id} apt={apt} isPast={true} />
            ))}
          </div>
        ) : (
          <div className="bg-transparent text-text/50 text-sm font-sans flex items-center gap-2">
            <Info size={16} />
            <span>سجل زياراتك الطبية سيظهر هنا فور اكتمالها.</span>
          </div>
        )}
      </section>
    </div>
  );
}
