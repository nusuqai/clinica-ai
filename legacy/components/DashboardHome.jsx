import React, { useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { Activity, Calendar as CalendarIcon, Clock, ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';
import DoctorBrowserModal from './DoctorBrowserModal';

export default function DashboardHome() {
  const { session } = useOutletContext();
  const [stats, setStats] = useState({ upcoming: 0, past: 0 });
  const [latestAppointment, setLatestAppointment] = useState(null);
  const [loading, setLoading] = useState(true);
  const [browserOpen, setBrowserOpen] = useState(false);

  useEffect(() => {
    async function fetchDashboardData() {
      try {
        const { data, error } = await supabase
          .from('appointments')
          .select('*, doctors(full_name, specialty)')
          .eq('user_id', session.user.id)
          .order('scheduled_at', { ascending: true });

        if (error) throw error;

        const now = new Date();
        const upcoming = data.filter(a => new Date(a.scheduled_at) >= now && a.status !== 'cancelled' && a.status !== 'completed');
        const past = data.filter(a => new Date(a.scheduled_at) < now);

        setStats({ upcoming: upcoming.length, past: past.length });
        setLatestAppointment(upcoming[0] || null);
      } catch (err) {
        console.error('Error fetching dashboard data:', err);
      } finally {
        setLoading(false);
      }
    }

    if (session?.user?.id) {
      fetchDashboardData();
      window.addEventListener('clinica-refresh-data', fetchDashboardData);
    }

    return () => {
      window.removeEventListener('clinica-refresh-data', fetchDashboardData);
    };
  }, [session]);

  const formatDate = (dateString) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    return new Intl.DateTimeFormat('ar-EG', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    }).format(date);
  };

  const formatTime = (dateString) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    return new Intl.DateTimeFormat('ar-EG', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    }).format(date);
  };

  if (loading) {
    return <div className="animate-pulse bg-white/50 h-64 rounded-[2rem]"></div>;
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <header>
        <h1 className="text-3xl font-heading font-bold text-primary mb-2">مرحباً بك، {session.user.user_metadata?.full_name || 'زائر'}!</h1>
        <p className="text-text/60 font-sans">هذه نظرة عامة على نشاطك في العيادة.</p>
      </header>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-3xl shadow-sm border border-primary/5 flex items-center gap-4">
          <div className="w-12 h-12 bg-accent/10 text-accent rounded-full flex items-center justify-center shrink-0">
            <CalendarIcon size={24} />
          </div>
          <div>
            <p className="text-sm text-text/60 font-sans font-medium">المواعيد القادمة</p>
            <p className="text-3xl font-heading font-bold text-primary">{stats.upcoming}</p>
          </div>
        </div>

        <div className="bg-white p-6 rounded-3xl shadow-sm border border-primary/5 flex items-center gap-4">
          <div className="w-12 h-12 bg-primary/10 text-primary rounded-full flex items-center justify-center shrink-0">
            <Clock size={24} />
          </div>
          <div>
            <p className="text-sm text-text/60 font-sans font-medium">المواعيد السابقة</p>
            <p className="text-3xl font-heading font-bold text-primary">{stats.past}</p>
          </div>
        </div>

        <div className="bg-gradient-to-br from-primary to-accent p-6 rounded-3xl shadow-md text-white flex flex-col justify-between relative overflow-hidden">
          <div className="absolute top-0 right-0 -mr-10 -mt-10 w-32 h-32 bg-white/10 rounded-full blur-2xl" />
          <div className="relative z-10">
            <h3 className="font-heading font-bold text-xl mb-1">صحتك تهمنا</h3>
            <p className="text-sm text-white/80 font-sans mb-4">احجز موعداً جديداً بضغطة زر</p>
          </div>
          <button
            onClick={() => setBrowserOpen(true)}
            className="bg-white text-primary text-center py-2.5 rounded-xl font-sans font-bold hover:bg-white/90 transition-colors relative z-10"
          >
            حجز موعد
          </button>
        </div>
      </div>

      {/* Latest Appointment Widget */}
      <div className="bg-white p-8 rounded-[2rem] shadow-sm border border-primary/5">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-heading font-bold text-primary flex items-center gap-2">
            <Activity className="text-accent" size={24} />
            موعدك القادم
          </h2>
          <Link to="/dashboard/appointments" className="text-sm text-accent font-sans font-medium hover:text-primary transition-colors flex items-center gap-1">
            عرض الكل
            <ArrowLeft size={16} />
          </Link>
        </div>

        {latestAppointment ? (
          <div className="bg-background border border-primary/10 rounded-2xl p-6 flex flex-col sm:flex-row gap-6 items-start sm:items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 bg-primary text-white rounded-full flex items-center justify-center font-heading text-xl shadow-md shrink-0">
                {formatDate(latestAppointment.scheduled_at).split(' ')[0]}
              </div>
              <div>
                <h3 className="font-heading font-bold text-lg text-primary">{latestAppointment.doctors?.full_name}</h3>
                <p className="font-sans text-sm text-text/60">{latestAppointment.doctors?.specialty}</p>
              </div>
            </div>

            <div className="flex flex-col gap-1 w-full sm:w-auto bg-white sm:bg-transparent p-4 sm:p-0 rounded-xl sm:rounded-none border sm:border-transparent border-primary/5">
              <div className="flex items-center gap-2 text-text/80 font-sans font-medium">
                <CalendarIcon size={16} className="text-accent" />
                <span>{formatDate(latestAppointment.scheduled_at)}</span>
              </div>
              <div className="flex items-center gap-2 text-text/80 font-sans font-medium">
                <Clock size={16} className="text-accent" />
                <span>{formatTime(latestAppointment.scheduled_at)}</span>
              </div>
            </div>
          </div>
        ) : (
          <div className="text-center py-10 bg-background rounded-2xl border border-primary/5 border-dashed">
            <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center mx-auto mb-4 text-text/30 shadow-sm">
              <CalendarIcon size={32} />
            </div>
            <p className="font-sans text-text/60 mb-2">لا يوجد لديك مواعيد قادمة.</p>
          </div>
        )}
      </div>

      {browserOpen && (
        <DoctorBrowserModal
          session={session}
          onClose={() => setBrowserOpen(false)}
        />
      )}
    </div>
  );
}
