import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  format, addMonths, subMonths, startOfWeek, endOfWeek,
  eachDayOfInterval, startOfMonth, endOfMonth,
  isSameMonth, isSameDay, isToday
} from 'date-fns';
import { ar } from 'date-fns/locale';
import { 
  ChevronRight, ChevronLeft, Loader2, Calendar as CalendarIcon, 
  Clock, User, CheckCircle2, XCircle, AlertCircle, RefreshCw, X
} from 'lucide-react';
import BookingModal from '../BookingModal';

export default function CalendarView({ session }) {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [cancellingId, setCancellingId] = useState(null);
  const [rebookDoctor, setRebookDoctor] = useState(null);
  const [confirmCancel, setConfirmCancel] = useState(null); // holds appointment to cancel

  const fetchAppointments = useCallback(async () => {
    if (!session?.user?.id) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('appointments')
        .select(`
          id, scheduled_at, status, reason, notes, time_slot_id,
          doctors (id, full_name, full_name_ar, specialty, specialty_ar, photo_url)
        `)
        .eq('user_id', session.user.id)
        .order('scheduled_at', { ascending: true });

      if (error) throw error;
      setAppointments(data || []);
    } catch (err) {
      console.error('Error fetching appointments:', err);
    } finally {
      setLoading(false);
    }
  }, [session]);

  useEffect(() => { 
    fetchAppointments(); 
    
    window.addEventListener('clinica-refresh-data', fetchAppointments);

    return () => {
      window.removeEventListener('clinica-refresh-data', fetchAppointments);
    };
  }, [fetchAppointments]);

  const handleCancel = async (apt) => {
    setCancellingId(apt.id);
    try {
      // Update appointment status
      await supabase
        .from('appointments')
        .update({ status: 'cancelled' })
        .eq('id', apt.id);

      // Free up the time slot
      if (apt.time_slot_id) {
        await supabase
          .from('time_slots')
          .update({ is_booked: false })
          .eq('id', apt.time_slot_id);
      }

      // Refresh
      setAppointments(prev =>
        prev.map(a => a.id === apt.id ? { ...a, status: 'cancelled' } : a)
      );
    } catch (err) {
      console.error('Cancel error:', err);
    } finally {
      setCancellingId(null);
    }
  };

  const nextMonth = () => setCurrentMonth(addMonths(currentMonth, 1));
  const prevMonth = () => setCurrentMonth(subMonths(currentMonth, 1));

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(monthStart);
  const calStart = startOfWeek(monthStart, { weekStartsOn: 6 });
  const calEnd = endOfWeek(monthEnd, { weekStartsOn: 6 });
  const days = eachDayOfInterval({ start: calStart, end: calEnd });
  const weekDays = ['السبت', 'الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة'];

  const selectedDayAppointments = appointments.filter(apt =>
    isSameDay(new Date(apt.scheduled_at), selectedDate)
  );

  const getStatusConfig = (status) => {
    switch (status) {
      case 'confirmed': return { color: 'bg-green-50 text-green-700 border-green-200', dot: 'bg-green-500', icon: <CheckCircle2 size={15} />, label: 'مؤكد' };
      case 'pending':   return { color: 'bg-yellow-50 text-yellow-700 border-yellow-200', dot: 'bg-yellow-400', icon: <AlertCircle size={15} />, label: 'قيد الانتظار' };
      case 'cancelled': return { color: 'bg-red-50 text-red-400 border-red-100', dot: 'bg-red-400', icon: <XCircle size={15} />, label: 'ملغي' };
      case 'completed': return { color: 'bg-primary/10 text-primary border-primary/20', dot: 'bg-primary', icon: <CheckCircle2 size={15} />, label: 'مكتمل' };
      default:          return { color: 'bg-gray-50 text-gray-600 border-gray-200', dot: 'bg-gray-400', icon: <CalendarIcon size={15} />, label: status };
    }
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-accent" />
      </div>
    );
  }

  return (
    <>
      <div className="space-y-6">
        <div className="flex flex-col md:flex-row gap-6">

          {/* Calendar Grid */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            className="bg-white rounded-3xl p-6 md:p-8 shadow-sm border border-primary/5 flex-grow md:w-2/3"
          >
            <div className="flex justify-between items-center mb-8">
              <h2 className="text-2xl font-bold font-heading text-primary capitalize">
                {format(currentMonth, 'MMMM yyyy', { locale: ar })}
              </h2>
              <div className="flex gap-2">
                <button onClick={nextMonth} className="p-2 rounded-xl bg-primary/5 text-primary hover:bg-accent hover:text-white transition-colors">
                  <ChevronRight size={20} />
                </button>
                <button onClick={prevMonth} className="p-2 rounded-xl bg-primary/5 text-primary hover:bg-accent hover:text-white transition-colors">
                  <ChevronLeft size={20} />
                </button>
              </div>
            </div>

            <div className="grid grid-cols-7 gap-1 mb-2">
              {weekDays.map(day => (
                <div key={day} className="text-center font-sans font-bold text-xs text-text/40 py-2">{day}</div>
              ))}
            </div>

            <div className="grid grid-cols-7 gap-1">
              {days.map((day, idx) => {
                const isCurrentMonth = isSameMonth(day, monthStart);
                const isSelected = isSameDay(day, selectedDate);
                const isDayToday = isToday(day);
                const dayApts = appointments.filter(a => isSameDay(new Date(a.scheduled_at), day));
                const hasConfirmed = dayApts.some(a => a.status === 'confirmed');
                const hasPending = dayApts.some(a => a.status === 'pending');
                const hasCancelled = dayApts.some(a => a.status === 'cancelled' && !hasConfirmed && !hasPending);

                return (
                  <div
                    key={idx}
                    onClick={() => { setSelectedDate(day); setCurrentMonth(day); }}
                    className={`
                      min-h-[72px] p-2 rounded-2xl border transition-all cursor-pointer relative group
                      ${!isCurrentMonth ? 'text-gray-300 bg-gray-50/50 border-transparent pointer-events-none' : 'bg-white border-primary/5'}
                      ${isSelected ? 'border-accent shadow-md bg-accent/5' : 'hover:border-primary/20'}
                      ${isDayToday && !isSelected ? 'border-primary/30' : ''}
                    `}
                  >
                    <span className={`font-sans font-bold text-sm ${isDayToday ? 'text-accent' : (!isCurrentMonth ? 'text-gray-300' : 'text-primary')}`}>
                      {format(day, 'd')}
                    </span>
                    <div className="absolute bottom-2 left-0 right-0 flex justify-center gap-1">
                      {hasConfirmed && <span className="w-2 h-2 rounded-full bg-green-500" />}
                      {hasPending   && <span className="w-2 h-2 rounded-full bg-yellow-400" />}
                      {hasCancelled && <span className="w-2 h-2 rounded-full bg-red-400" />}
                    </div>
                  </div>
                );
              })}
            </div>
          </motion.div>

          {/* Agenda Panel */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.1 }}
            className="bg-white rounded-3xl p-6 md:p-8 shadow-sm border border-primary/5 md:w-1/3 flex flex-col"
          >
            <div className="mb-6">
              <h3 className="text-xl font-bold font-heading text-primary">المواعيد</h3>
              <p className="font-sans text-text/60">{format(selectedDate, 'EEEE, d MMMM', { locale: ar })}</p>
            </div>

            <div className="flex-1 overflow-y-auto space-y-4 min-h-[200px]">
              <AnimatePresence>
                {selectedDayAppointments.length === 0 ? (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="h-full flex flex-col items-center justify-center text-center opacity-50 space-y-3 py-10"
                  >
                    <CalendarIcon size={48} className="text-primary/30" />
                    <p className="font-sans font-medium text-primary">لا توجد مواعيد في هذا اليوم</p>
                  </motion.div>
                ) : (
                  selectedDayAppointments.map(apt => {
                    const cfg = getStatusConfig(apt.status);
                    const isCancelled = apt.status === 'cancelled';
                    const isCancelling = cancellingId === apt.id;

                    return (
                      <motion.div
                        key={apt.id}
                        layout
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        className={`p-4 rounded-2xl border ${cfg.color} bg-white shadow-sm ${isCancelled ? 'opacity-60' : ''}`}
                      >
                        {/* Status + time */}
                        <div className="flex justify-between items-start mb-2">
                          <div className={`px-2 py-0.5 rounded-md flex items-center gap-1 text-xs font-bold border ${cfg.color}`}>
                            {cfg.icon} {cfg.label}
                          </div>
                          <div className="flex items-center gap-1 text-primary/70 font-sans text-sm font-bold bg-gray-50 px-2 py-0.5 rounded-md" dir="ltr">
                            <Clock size={13} />
                            {format(new Date(apt.scheduled_at), 'h:mm a')}
                          </div>
                        </div>

                        {/* Doctor info */}
                        <h4 className="font-heading font-bold text-base text-primary">
                          {apt.doctors?.full_name_ar || apt.doctors?.full_name}
                        </h4>
                        <p className="font-sans text-xs text-text/60 flex items-center gap-1 mb-2">
                          <User size={12} />
                          {apt.doctors?.specialty_ar || apt.doctors?.specialty}
                        </p>

                        {apt.reason && (
                          <p className="font-sans text-xs text-text/70 bg-background/70 p-2 rounded-xl line-clamp-2 mb-3">
                            <span className="font-bold opacity-70">السبب: </span>{apt.reason}
                          </p>
                        )}

                        {/* Action buttons */}
                        {!isCancelled && (
                          <div className="flex gap-2 mt-2">
                            <button
                              onClick={() => setRebookDoctor(apt.doctors)}
                              className="flex-1 flex items-center justify-center gap-1 text-xs font-sans font-bold py-2 rounded-xl bg-primary/5 text-primary hover:bg-accent/10 hover:text-accent transition-colors"
                            >
                              <RefreshCw size={12} /> إعادة حجز
                            </button>
                            <button
                              onClick={() => setConfirmCancel(apt)}
                              disabled={isCancelling}
                              className="flex-1 flex items-center justify-center gap-1 text-xs font-sans font-bold py-2 rounded-xl bg-red-50 text-red-500 hover:bg-red-100 transition-colors disabled:opacity-50"
                            >
                              {isCancelling ? <Loader2 size={12} className="animate-spin" /> : <X size={12} />}
                              إلغاء
                            </button>
                          </div>
                        )}

                        {isCancelled && (
                          <button
                            onClick={() => setRebookDoctor(apt.doctors)}
                            className="w-full flex items-center justify-center gap-1 text-xs font-sans font-bold py-2 rounded-xl bg-primary/5 text-primary hover:bg-accent/10 hover:text-accent transition-colors mt-2"
                          >
                            <RefreshCw size={12} /> احجز موعداً جديداً
                          </button>
                        )}
                      </motion.div>
                    );
                  })
                )}
              </AnimatePresence>
            </div>

            <div className="pt-4 mt-auto">
              <a
                href="/#doctors"
                className="w-full flex items-center justify-center gap-2 bg-primary text-white hover:bg-accent hover:text-primary font-sans font-bold py-3 px-4 rounded-xl transition-colors"
              >
                <CalendarIcon size={18} />
                حجز موعد جديد
              </a>
            </div>
          </motion.div>
        </div>
      </div>

      {/* Rebook Modal */}
      {rebookDoctor && (
        <BookingModal
          doctor={rebookDoctor}
          session={session}
          onClose={() => {
            setRebookDoctor(null);
            fetchAppointments();
          }}
        />
      )}

      {/* Custom Cancel Confirmation Modal */}
      <AnimatePresence>
        {confirmCancel && (
          <motion.div
            key="cancel-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={() => setConfirmCancel(null)}
          >
            <motion.div
              key="cancel-modal"
              initial={{ scale: 0.9, opacity: 0, y: 10 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 10 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="bg-white rounded-3xl p-8 max-w-sm w-full shadow-2xl text-center"
              dir="rtl"
              onClick={e => e.stopPropagation()}
            >
              <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-4">
                <XCircle size={36} className="text-red-500" />
              </div>
              <h3 className="font-heading font-bold text-xl text-primary mb-2">إلغاء الموعد</h3>
              <p className="font-sans text-text/70 mb-2">
                هل أنت متأكد من إلغاء موعدك مع{' '}
                <strong>{confirmCancel.doctors?.full_name_ar || confirmCancel.doctors?.full_name}</strong>؟
              </p>
              <p className="font-sans text-sm text-text/50 mb-6">لا يمكن التراجع عن هذا الإجراء.</p>
              <div className="flex gap-3">
                <button
                  onClick={() => setConfirmCancel(null)}
                  className="flex-1 py-3 rounded-xl bg-gray-100 text-primary font-sans font-bold hover:bg-gray-200 transition-colors"
                >
                  تراجع
                </button>
                <button
                  onClick={() => {
                    const apt = confirmCancel;
                    setConfirmCancel(null);
                    handleCancel(apt);
                  }}
                  className="flex-1 py-3 rounded-xl bg-red-500 text-white font-sans font-bold hover:bg-red-600 transition-colors"
                >
                  تأكيد الإلغاء
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
