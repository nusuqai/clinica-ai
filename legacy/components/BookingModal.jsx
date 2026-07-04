import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { AnimatePresence, motion } from 'framer-motion';
import { 
  X, ChevronRight, ChevronLeft, CheckCircle2, 
  Loader2, Calendar, Clock, User, Star
} from 'lucide-react';
import { 
  format, addMonths, subMonths, startOfMonth, endOfMonth, 
  eachDayOfInterval, startOfWeek, endOfWeek, isSameDay, 
  isSameMonth, isToday, isPast, isBefore, startOfDay
} from 'date-fns';
import { ar } from 'date-fns/locale';

const STEPS = { CALENDAR: 0, TIME: 1, CONFIRM: 2, SUCCESS: 3 };

export default function BookingModal({ doctor, onClose, session }) {
  const [step, setStep] = useState(STEPS.CALENDAR);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [allSlots, setAllSlots] = useState([]);
  const [selectedDate, setSelectedDate] = useState(null);
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  // Fetch all available slots for this doctor
  useEffect(() => {
    async function fetchSlots() {
      setLoading(true);
      const { data, error } = await supabase
        .from('time_slots')
        .select('*')
        .eq('doctor_id', doctor.id)
        .eq('is_booked', false)
        .gte('starts_at', new Date().toISOString())
        .order('starts_at', { ascending: true });

      if (!error) setAllSlots(data || []);
      setLoading(false);
    }
    fetchSlots();
  }, [doctor.id]);

  // Dates that have at least one available slot
  const availableDates = new Set(
    allSlots.map(s => format(new Date(s.starts_at), 'yyyy-MM-dd'))
  );

  // Slots for the selected date
  const slotsForDate = selectedDate
    ? allSlots.filter(s => isSameDay(new Date(s.starts_at), selectedDate))
    : [];

  // Calendar grid
  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const calStart = startOfWeek(monthStart, { weekStartsOn: 6 }); // Saturday first
  const calEnd = endOfWeek(monthEnd, { weekStartsOn: 6 });
  const calDays = eachDayOfInterval({ start: calStart, end: calEnd });
  const weekDays = ['س', 'ح', 'ن', 'ث', 'ر', 'خ', 'ج'];

  const handleDateSelect = (day) => {
    const key = format(day, 'yyyy-MM-dd');
    if (!availableDates.has(key)) return;
    setSelectedDate(day);
    setSelectedSlot(null);
    setStep(STEPS.TIME);
  };

  const handleBook = async () => {
    if (!selectedSlot) return;
    if (!session) { window.location.href = '/login'; return; }

    setSubmitting(true);
    setError('');

    try {
      // 1. Create appointment
      const { error: aptError } = await supabase.from('appointments').insert({
        user_id: session.user.id,
        doctor_id: doctor.id,
        time_slot_id: selectedSlot.id,
        scheduled_at: selectedSlot.starts_at,
        status: 'confirmed',
        reason: reason || null,
      });
      if (aptError) throw aptError;

      // 2. Mark slot as booked
      const { error: slotError } = await supabase
        .from('time_slots')
        .update({ is_booked: true })
        .eq('id', selectedSlot.id);
      if (slotError) throw slotError;

      setStep(STEPS.SUCCESS);
    } catch (err) {
      console.error(err);
      setError('حدث خطأ أثناء الحجز. يرجى المحاولة مجدداً.');
    } finally {
      setSubmitting(false);
    }
  };

  const photoUrl = doctor.photo_url || 
    `https://ui-avatars.com/api/?name=${encodeURIComponent(doctor.full_name)}&background=0D9488&color=fff&size=200`;

  return (
    <AnimatePresence>
      {/* Backdrop */}
      <motion.div
        key="backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
        onClick={onClose}
      >
        {/* Modal */}
        <motion.div
          key="modal"
          initial={{ scale: 0.92, opacity: 0, y: 20 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.92, opacity: 0, y: 20 }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          className="bg-white rounded-[2rem] w-full max-w-lg shadow-2xl overflow-hidden relative"
          onClick={e => e.stopPropagation()}
          dir="rtl"
        >
          {/* Close button */}
          <button 
            onClick={onClose}
            className="absolute top-5 left-5 z-10 w-9 h-9 bg-black/10 hover:bg-black/20 rounded-full flex items-center justify-center transition-colors"
          >
            <X size={18} />
          </button>

          {/* Doctor header */}
          <div className="relative h-40 bg-gradient-to-br from-primary to-primary/80 overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-r from-primary via-accent/30 to-primary" />
            <div className="relative z-10 flex items-center gap-5 p-6 h-full">
              <img 
                src={photoUrl} 
                alt={doctor.full_name}
                className="w-20 h-20 rounded-2xl object-cover object-top border-2 border-white/30 shadow-lg shrink-0"
              />
              <div className="text-white">
                <p className="text-white/70 text-sm font-sans mb-0.5">
                  {doctor.specialty_ar || doctor.specialty}
                </p>
                <h3 className="font-heading font-bold text-2xl leading-tight">
                  {doctor.full_name_ar || doctor.full_name}
                </h3>
                <p className="text-white/60 text-xs font-sans mt-1">{doctor.full_name}</p>
                {doctor.rating && (
                  <div className="flex items-center gap-1 mt-1">
                    <Star size={12} className="fill-accent text-accent" />
                    <span className="text-accent text-sm font-bold">{doctor.rating}</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Step indicators */}
          {step < STEPS.SUCCESS && (
            <div className="flex items-center justify-center gap-2 py-4 border-b border-primary/5">
              {['اختر اليوم', 'اختر الوقت', 'تأكيد'].map((label, idx) => (
                <div key={idx} className="flex items-center gap-1">
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
                    idx < step ? 'bg-accent text-primary' :
                    idx === step ? 'bg-primary text-white' : 
                    'bg-gray-100 text-gray-400'
                  }`}>
                    {idx < step ? '✓' : idx + 1}
                  </div>
                  <span className={`text-xs font-sans hidden sm:block ${idx === step ? 'text-primary font-bold' : 'text-text/40'}`}>
                    {label}
                  </span>
                  {idx < 2 && <ChevronLeft size={14} className="text-gray-300" />}
                </div>
              ))}
            </div>
          )}

          {/* Content area */}
          <div className="max-h-[50vh] overflow-y-auto">
            <AnimatePresence mode="wait">
              {/* STEP 0 — Calendar */}
              {step === STEPS.CALENDAR && (
                <motion.div
                  key="calendar"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  className="p-6"
                >
                  {loading ? (
                    <div className="flex justify-center py-10">
                      <Loader2 size={32} className="animate-spin text-accent" />
                    </div>
                  ) : (
                    <>
                      <div className="flex justify-between items-center mb-4">
                        <button onClick={() => setCurrentMonth(m => addMonths(m, 1))} className="p-1.5 rounded-lg hover:bg-gray-100">
                          <ChevronRight size={18} />
                        </button>
                        <h4 className="font-heading font-bold text-primary capitalize">
                          {format(currentMonth, 'MMMM yyyy', { locale: ar })}
                        </h4>
                        <button 
                          onClick={() => setCurrentMonth(m => subMonths(m, 1))}
                          disabled={isBefore(subMonths(currentMonth, 0), startOfDay(new Date()))}
                          className="p-1.5 rounded-lg hover:bg-gray-100 disabled:opacity-30"
                        >
                          <ChevronLeft size={18} />
                        </button>
                      </div>
                      <div className="grid grid-cols-7 gap-1 mb-2">
                        {weekDays.map(d => (
                          <div key={d} className="text-center text-xs font-bold text-text/40 py-1">{d}</div>
                        ))}
                      </div>
                      <div className="grid grid-cols-7 gap-1">
                        {calDays.map((day, i) => {
                          const key = format(day, 'yyyy-MM-dd');
                          const isAvail = availableDates.has(key);
                          const isCurrentMonth = isSameMonth(day, currentMonth);
                          const isPastDay = isBefore(day, startOfDay(new Date()));
                          const isSelected = selectedDate && isSameDay(day, selectedDate);

                          return (
                            <button
                              key={i}
                              onClick={() => handleDateSelect(day)}
                              disabled={!isAvail || isPastDay || !isCurrentMonth}
                              className={`
                                h-10 w-full rounded-xl text-sm font-sans font-medium transition-all relative
                                ${!isCurrentMonth ? 'opacity-0 pointer-events-none' : ''}
                                ${isPastDay ? 'text-gray-300 cursor-not-allowed' : ''}
                                ${isAvail && !isPastDay ? 'hover:bg-primary/10 cursor-pointer text-primary' : ''}
                                ${isSelected ? 'bg-primary text-white hover:bg-primary' : ''}
                                ${isToday(day) && !isSelected ? 'ring-2 ring-accent ring-offset-1' : ''}
                              `}
                            >
                              {format(day, 'd')}
                              {isAvail && !isPastDay && !isSelected && (
                                <span className="absolute bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-accent" />
                              )}
                            </button>
                          );
                        })}
                      </div>
                      <p className="text-xs text-center text-text/40 font-sans mt-4 flex items-center justify-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-accent inline-block" />
                        الأيام المميزة بها مواعيد متاحة
                      </p>
                    </>
                  )}
                </motion.div>
              )}

              {/* STEP 1 — Time picker */}
              {step === STEPS.TIME && (
                <motion.div
                  key="time"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  className="p-6"
                >
                  <div className="flex items-center gap-3 mb-5">
                    <button 
                      onClick={() => setStep(STEPS.CALENDAR)}
                      className="p-2 rounded-xl bg-gray-100 hover:bg-gray-200 transition-colors"
                    >
                      <ChevronRight size={16} />
                    </button>
                    <div>
                      <p className="text-xs text-text/50 font-sans">اليوم المختار</p>
                      <p className="font-heading font-bold text-primary">
                        {selectedDate && format(selectedDate, 'EEEE, d MMMM yyyy', { locale: ar })}
                      </p>
                    </div>
                  </div>

                  {slotsForDate.length === 0 ? (
                    <p className="text-center text-text/50 font-sans py-8">لا توجد مواعيد متاحة في هذا اليوم.</p>
                  ) : (
                    <div className="grid grid-cols-3 gap-2">
                      {slotsForDate.map(slot => {
                        const isSelected = selectedSlot?.id === slot.id;
                        return (
                          <button
                            key={slot.id}
                            onClick={() => setSelectedSlot(slot)}
                            className={`
                              py-3 rounded-xl font-sans text-sm font-bold transition-all border-2
                              ${isSelected 
                                ? 'bg-primary text-white border-primary shadow-md scale-105' 
                                : 'bg-background border-primary/10 text-primary hover:border-primary/40 hover:bg-primary/5'}
                            `}
                            dir="ltr"
                          >
                            {format(new Date(slot.starts_at), 'h:mm a')}
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {selectedSlot && (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="mt-5 space-y-3"
                    >
                      <textarea
                        value={reason}
                        onChange={e => setReason(e.target.value)}
                        placeholder="سبب الزيارة (اختياري)..."
                        rows={2}
                        className="w-full px-4 py-3 rounded-xl border border-primary/10 bg-background font-sans text-sm text-primary focus:outline-none focus:ring-2 focus:ring-accent/40 resize-none"
                      />
                      <button
                        onClick={() => setStep(STEPS.CONFIRM)}
                        className="w-full bg-primary text-white font-sans font-bold py-3 rounded-xl hover:bg-accent hover:text-primary transition-colors"
                      >
                        التالي: مراجعة الحجز
                      </button>
                    </motion.div>
                  )}
                </motion.div>
              )}

              {/* STEP 2 — Confirm */}
              {step === STEPS.CONFIRM && (
                <motion.div
                  key="confirm"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  className="p-6 space-y-4"
                >
                  <div className="flex items-center gap-3 mb-2">
                    <button
                      onClick={() => setStep(STEPS.TIME)}
                      className="p-2 rounded-xl bg-gray-100 hover:bg-gray-200 transition-colors"
                    >
                      <ChevronRight size={16} />
                    </button>
                    <h4 className="font-heading font-bold text-xl text-primary">مراجعة الحجز</h4>
                  </div>

                  <div className="bg-background rounded-2xl p-5 space-y-4 border border-primary/5">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-primary/10 text-primary rounded-xl flex items-center justify-center">
                        <User size={20} />
                      </div>
                      <div>
                        <p className="text-xs text-text/50 font-sans">الطبيب</p>
                        <p className="font-heading font-bold text-primary">{doctor.full_name_ar || doctor.full_name}</p>
                        <p className="text-xs text-text/60 font-sans">{doctor.specialty_ar || doctor.specialty}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-accent/10 text-accent rounded-xl flex items-center justify-center">
                        <Calendar size={20} />
                      </div>
                      <div>
                        <p className="text-xs text-text/50 font-sans">التاريخ</p>
                        <p className="font-heading font-bold text-primary">
                          {selectedDate && format(selectedDate, 'EEEE، d MMMM yyyy', { locale: ar })}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-accent/10 text-accent rounded-xl flex items-center justify-center">
                        <Clock size={20} />
                      </div>
                      <div>
                        <p className="text-xs text-text/50 font-sans">الوقت</p>
                        <p className="font-heading font-bold text-primary" dir="ltr">
                          {selectedSlot && format(new Date(selectedSlot.starts_at), 'h:mm a')} – {' '}
                          {selectedSlot && format(new Date(selectedSlot.ends_at), 'h:mm a')}
                        </p>
                      </div>
                    </div>
                    {reason && (
                      <div className="pt-3 border-t border-primary/5">
                        <p className="text-xs text-text/50 font-sans mb-1">سبب الزيارة</p>
                        <p className="font-sans text-sm text-text">{reason}</p>
                      </div>
                    )}
                  </div>

                  {error && (
                    <p className="text-red-500 text-sm font-sans text-center">{error}</p>
                  )}

                  <button
                    onClick={handleBook}
                    disabled={submitting}
                    className="w-full bg-primary text-white font-sans font-bold py-4 rounded-2xl hover:bg-accent hover:text-primary transition-colors text-lg disabled:opacity-70 flex items-center justify-center gap-2"
                  >
                    {submitting ? <Loader2 size={20} className="animate-spin" /> : <CheckCircle2 size={20} />}
                    تأكيد الحجز
                  </button>
                </motion.div>
              )}

              {/* STEP 3 — Success */}
              {step === STEPS.SUCCESS && (
                <motion.div
                  key="success"
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="p-10 flex flex-col items-center text-center gap-4"
                >
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: 'spring', delay: 0.1, damping: 12 }}
                    className="w-24 h-24 bg-green-50 rounded-full flex items-center justify-center"
                  >
                    <CheckCircle2 size={52} className="text-green-500" />
                  </motion.div>
                  <h3 className="font-heading font-bold text-2xl text-primary">تم الحجز بنجاح!</h3>
                  <p className="font-sans text-text/70 leading-relaxed">
                    تم تأكيد موعدك مع <strong>{doctor.full_name_ar || doctor.full_name}</strong>
                    <br />
                    بتاريخ {selectedDate && format(selectedDate, 'd MMMM', { locale: ar })}{' '}
                    الساعة{' '}
                    <span dir="ltr" className="font-bold">
                      {selectedSlot && format(new Date(selectedSlot.starts_at), 'h:mm a')}
                    </span>
                  </p>
                  <div className="flex gap-3 w-full mt-2">
                    <button
                      onClick={() => window.location.href = '/dashboard/appointments'}
                      className="flex-1 bg-primary text-white font-sans font-bold py-3 rounded-xl hover:bg-primary/90 transition-colors"
                    >
                      عرض مواعيدي
                    </button>
                    <button
                      onClick={onClose}
                      className="flex-1 bg-gray-100 text-primary font-sans font-bold py-3 rounded-xl hover:bg-gray-200 transition-colors"
                    >
                      إغلاق
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
