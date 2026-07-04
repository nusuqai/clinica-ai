import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { motion } from 'framer-motion';
import { Loader2, CheckCircle2 } from 'lucide-react';

const specialtyMap = {
  'General Practitioner': 'طب عام',
  'Cardiologist': 'أمراض القلب',
  'Dermatologist': 'الأمراض الجلدية',
  'Neurologist': 'طب الأعصاب',
  'Endocrinologist': 'الغدد الصماء'
};

export default function AppointmentCTA() {
  const [doctors, setDoctors] = useState([]);
  const [slots, setSlots] = useState([]);
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    doctorId: '',
    slotId: '',
    reason: ''
  });
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    async function fetchDoctors() {
      const { data } = await supabase.from('doctors').select('id, full_name, specialty');
      if (data) setDoctors(data);
    }
    fetchDoctors();
  }, []);

  useEffect(() => {
    async function fetchSlots() {
      if (!formData.doctorId) {
        setSlots([]);
        return;
      }
      const { data } = await supabase
        .from('v_available_slots')
        .select('*')
        .eq('doctor_id', formData.doctorId)
        .order('starts_at', { ascending: true });
        
      if (data) setSlots(data);
    }
    fetchSlots();
  }, [formData.doctorId]);

  // GSAP removed

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      if (!formData.doctorId || !formData.slotId) {
        throw new Error('يرجى اختيار الطبيب ووقت الموعد');
      }

      // Automatically assign user_id if logged in
      let userId = null;
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
         userId = session.user.id;
      }

      const selectedSlot = slots.find(s => s.id === formData.slotId);

      const { error: submitError } = await supabase.from('appointments').insert({
        p_name: formData.name,
        p_phone: formData.phone,
        doctor_id: formData.doctorId,
        scheduled_at: selectedSlot?.starts_at,
        reason: formData.reason,
        status: 'pending',
        user_id: userId
      });

      if (submitError) throw submitError;

      setSuccess(true);
      setFormData({ name: '', phone: '', doctorId: '', slotId: '', reason: '' });
      setTimeout(() => setSuccess(false), 5000);
    } catch (err) {
      setError(err.message || 'حدث خطأ أثناء الحجز. يرجى المحاولة مرة أخرى.');
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e) => {
    setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return new Intl.DateTimeFormat('ar-EG', { 
      weekday: 'short', 
      month: 'short', 
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    }).format(date);
  };

  return (
    <section id="book" className="relative py-24 bg-primary overflow-hidden">
      {/* Parallax Texture */}
      <div className="absolute inset-0 opacity-10 bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.1)_1px,transparent_1px)] bg-[size:24px_24px] pointer-events-none" />
      <div className="absolute -top-[20%] -right-[10%] w-[50%] h-[50%] bg-accent/20 blur-[120px] rounded-full pointer-events-none" />

      <div className="max-w-7xl mx-auto px-6 lg:px-12 relative z-10">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
          
          {/* Right Panel (Text) */}
          <motion.div 
            className="order-2 lg:order-1"
            initial={{ opacity: 0, x: 50 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, margin: "-100px" }}
            transition={{ duration: 0.8, ease: "easeOut" }}
          >
            <h2 className="text-white mb-6">
              <span className="block font-sans text-xl md:text-2xl text-background/70 mb-4 font-medium">معظم العيادات تُركّز على: العلاج فقط.</span>
              <span className="block font-serif italic text-5xl md:text-7xl text-accent leading-tight">نحن نُركّز على: صحتك الشاملة.</span>
            </h2>
            <p className="font-sans text-xl text-background/80 max-w-lg leading-relaxed">
              لا تدع جدولك المزدحم يعيقك عن الاهتمام بصحتك. احجز موعدك الآن في دقائق، ودعنا نعتني بالباقي.
            </p>
          </motion.div>

          {/* Left Panel (Form) */}
          <motion.div 
            className="order-1 lg:order-2"
            initial={{ opacity: 0, x: -50 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, margin: "-100px" }}
            transition={{ duration: 0.8, ease: "easeOut", delay: 0.2 }}
          >
            <div className="bg-white rounded-[2rem] p-8 md:p-10 shadow-2xl relative">
              <h3 className="font-heading font-bold text-3xl text-primary mb-8 text-center">احجز موعدك</h3>

              {success ? (
                <div className="flex flex-col items-center justify-center text-center py-12 space-y-4">
                  <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-4">
                    <CheckCircle2 className="w-10 h-10 text-green-600" />
                  </div>
                  <h4 className="font-heading font-bold text-2xl text-primary">تم حجز موعدك بنجاح!</h4>
                  <p className="font-sans text-text/70">سنتواصل معك قريبًا لتأكيد الموعد.</p>
                  <button 
                    onClick={() => setSuccess(false)}
                    className="mt-6 text-accent font-sans font-medium hover:underline"
                  >
                    حجز موعد آخر
                  </button>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-5">
                  {error && (
                    <div className="bg-red-50 text-red-600 p-4 rounded-xl font-sans text-sm border border-red-100 flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-red-600 shrink-0" />
                      <span>{error}</span>
                    </div>
                  )}

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    <div>
                      <label htmlFor="name" className="block font-sans text-sm text-text/70 mb-2 font-medium">الاسم الكامل</label>
                      <input 
                        type="text" 
                        id="name"
                        name="name"
                        required
                        value={formData.name}
                        onChange={handleChange}
                        className="w-full bg-background border border-primary/10 rounded-xl px-4 py-3 font-sans text-primary focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-all"
                        placeholder="أدخل اسمك الكامل"
                      />
                    </div>
                    <div>
                      <label htmlFor="phone" className="block font-sans text-sm text-text/70 mb-2 font-medium">رقم الجوال</label>
                      <input 
                        type="tel" 
                        id="phone"
                        name="phone"
                        required
                        dir="ltr"
                        value={formData.phone}
                        onChange={handleChange}
                        className="w-full bg-background border border-primary/10 rounded-xl px-4 py-3 font-sans text-primary focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-all text-right"
                        placeholder="05X XXX XXXX"
                      />
                    </div>
                  </div>

                  <div>
                    <label htmlFor="doctorId" className="block font-sans text-sm text-text/70 mb-2 font-medium">اختر الطبيب</label>
                    <select 
                      id="doctorId"
                      name="doctorId"
                      required
                      value={formData.doctorId}
                      onChange={handleChange}
                      className="w-full bg-background border border-primary/10 rounded-xl px-4 py-3 font-sans text-primary focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-all appearance-none"
                    >
                      <option value="">-- اختر من القائمة --</option>
                      {doctors.map(doc => (
                        <option key={doc.id} value={doc.id}>{doc.full_name} ({specialtyMap[doc.specialty] || doc.specialty})</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label htmlFor="slotId" className="block font-sans text-sm text-text/70 mb-2 font-medium">اختر الموعد</label>
                    <select 
                      id="slotId"
                      name="slotId"
                      required
                      disabled={!formData.doctorId || slots.length === 0}
                      value={formData.slotId}
                      onChange={handleChange}
                      className="w-full bg-background border border-primary/10 rounded-xl px-4 py-3 font-sans text-primary focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-all appearance-none disabled:opacity-50"
                    >
                      <option value="">{formData.doctorId ? (slots.length > 0 ? '-- اختر الموعد المناسب --' : 'لا توجد مواعيد متاحة') : '-- اختر الطبيب أولاً --'}</option>
                      {slots.map(slot => (
                        <option key={slot.id} value={slot.id}>{formatDate(slot.starts_at)}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label htmlFor="reason" className="block font-sans text-sm text-text/70 mb-2 font-medium">سبب الزيارة (اختياري)</label>
                    <textarea 
                      id="reason"
                      name="reason"
                      rows="3"
                      value={formData.reason}
                      onChange={handleChange}
                      className="w-full bg-background border border-primary/10 rounded-xl px-4 py-3 font-sans text-primary focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-all resize-none"
                      placeholder="صف باختصار الأعراض أو سبب الاستشارة"
                    ></textarea>
                  </div>

                  <button 
                    type="submit"
                    disabled={loading}
                    className="w-full bg-accent text-white font-sans font-bold text-lg py-4 rounded-xl hover:bg-[#00a8b0] hover:scale-[1.01] transition-all duration-300 shadow-md hover:shadow-accent/30 flex justify-center items-center disabled:opacity-70 disabled:hover:scale-100"
                  >
                    {loading ? (
                      <Loader2 className="animate-spin w-6 h-6" />
                    ) : (
                      'تأكيد الحجز'
                    )}
                  </button>
                </form>
              )}
            </div>
          </motion.div>

        </div>
      </div>
    </section>
  );
}
