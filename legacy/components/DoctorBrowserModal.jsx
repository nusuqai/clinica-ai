import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Search, Star, Users, GraduationCap, Clock, Filter, ChevronDown } from 'lucide-react';
import BookingModal from './BookingModal';

const SPECIALTIES = [
  { en: 'All', ar: 'الكل' },
  { en: 'Cardiologist', ar: 'أمراض القلب' },
  { en: 'Dermatologist', ar: 'الأمراض الجلدية' },
  { en: 'Neurologist', ar: 'طب الأعصاب' },
  { en: 'Pediatrician', ar: 'طب الأطفال' },
  { en: 'Orthopedic Surgeon', ar: 'جراحة العظام' },
  { en: 'Endocrinologist', ar: 'الغدد الصماء' },
  { en: 'General Practitioner', ar: 'طب عام' },
  { en: 'Ophthalmologist', ar: 'طب العيون' },
];

const SORT_OPTIONS = [
  { value: 'rating', label: 'الأعلى تقييماً' },
  { value: 'experience', label: 'الأكثر خبرة' },
  { value: 'patients', label: 'الأكثر مرضى' },
];

export default function DoctorBrowserModal({ onClose, session }) {
  const [doctors, setDoctors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedSpecialty, setSelectedSpecialty] = useState('All');
  const [sortBy, setSortBy] = useState('rating');
  const [selectedDoctor, setSelectedDoctor] = useState(null);
  const [expandedDoctor, setExpandedDoctor] = useState(null);

  useEffect(() => {
    async function fetchDoctors() {
      const { data } = await supabase.from('doctors').select('*');
      if (data) setDoctors(data);
      setLoading(false);
    }
    fetchDoctors();
  }, []);

  const filtered = doctors
    .filter(d => {
      const matchSearch = !search ||
        d.full_name?.toLowerCase().includes(search.toLowerCase()) ||
        d.full_name_ar?.includes(search) ||
        d.specialty?.toLowerCase().includes(search.toLowerCase()) ||
        d.specialty_ar?.includes(search);
      const matchSpecialty = selectedSpecialty === 'All' || d.specialty === selectedSpecialty;
      return matchSearch && matchSpecialty;
    })
    .sort((a, b) => {
      if (sortBy === 'rating') return (b.rating || 0) - (a.rating || 0);
      if (sortBy === 'experience') return (b.years_experience || 0) - (a.years_experience || 0);
      if (sortBy === 'patients') return (b.patients_count || 0) - (a.patients_count || 0);
      return 0;
    });

  const renderStars = (rating) =>
    Array.from({ length: 5 }, (_, i) => (
      <Star key={i} size={12} className={i < Math.floor(rating || 5) ? "fill-accent text-accent" : "text-gray-200"} />
    ));

  return (
    <AnimatePresence>
      {/* Backdrop */}
      <motion.div
        key="browser-backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-3 md:p-6"
        onClick={onClose}
      >
        {/* Modal Shell */}
        <motion.div
          key="browser-modal"
          initial={{ scale: 0.94, opacity: 0, y: 20 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.94, opacity: 0, y: 20 }}
          transition={{ type: 'spring', damping: 26, stiffness: 280 }}
          className="bg-background w-full max-w-5xl max-h-[92vh] rounded-[2rem] shadow-2xl overflow-hidden flex flex-col"
          dir="rtl"
          onClick={e => e.stopPropagation()}
        >
          {/* Header */}
          <div className="bg-gradient-to-l from-primary to-primary/85 p-6 md:p-8 relative overflow-hidden shrink-0">
            <div className="absolute inset-0 opacity-10 bg-[radial-gradient(ellipse_at_top_right,_#F59E0B_0%,_transparent_60%)]" />
            <div className="relative z-10 flex justify-between items-start gap-4">
              <div>
                <h2 className="font-heading font-bold text-3xl text-white mb-1">تصفح الأطباء</h2>
                <p className="font-sans text-white/70 text-sm">
                  {filtered.length} طبيب متاح للحجز · اختر طبيبك واحجز موعداً الآن
                </p>
              </div>
              <button
                onClick={onClose}
                className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors shrink-0 mt-1"
              >
                <X size={20} />
              </button>
            </div>

            {/* Search + Filters Row */}
            <div className="relative z-10 mt-5 flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Search size={16} className="absolute top-1/2 right-4 -translate-y-1/2 text-white/50" />
                <input
                  type="text"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="ابحث باسم الطبيب أو التخصص..."
                  className="w-full bg-white/10 border border-white/20 text-white placeholder:text-white/40 rounded-xl pr-10 pl-4 py-2.5 font-sans text-sm focus:outline-none focus:bg-white/15"
                />
              </div>
              <div className="relative">
                <select
                  value={sortBy}
                  onChange={e => setSortBy(e.target.value)}
                  className="appearance-none bg-white/10 border border-white/20 text-white rounded-xl px-4 py-2.5 pr-9 font-sans text-sm focus:outline-none cursor-pointer"
                >
                  {SORT_OPTIONS.map(o => <option key={o.value} value={o.value} className="text-primary">{o.label}</option>)}
                </select>
                <ChevronDown size={14} className="absolute top-1/2 left-3 -translate-y-1/2 text-white/50 pointer-events-none" />
              </div>
            </div>
          </div>

          {/* Specialty Pills */}
          <div className="flex gap-2 px-6 py-4 overflow-x-auto scrollbar-none border-b border-primary/5 shrink-0 bg-white">
            {SPECIALTIES.map(s => (
              <button
                key={s.en}
                onClick={() => setSelectedSpecialty(s.en)}
                className={`whitespace-nowrap px-4 py-1.5 rounded-full text-sm font-sans font-bold transition-all shrink-0 ${
                  selectedSpecialty === s.en
                    ? 'bg-primary text-white shadow-md'
                    : 'bg-primary/5 text-primary hover:bg-primary/10'
                }`}
              >
                {s.ar}
              </button>
            ))}
          </div>

          {/* Doctor Grid */}
          <div className="overflow-y-auto flex-1 p-6">
            {loading ? (
              <div className="flex justify-center py-16">
                <div className="w-10 h-10 border-4 border-primary/20 border-t-accent rounded-full animate-spin" />
              </div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-16 text-text/40 font-sans">
                <Search size={40} className="mx-auto mb-3 opacity-30" />
                <p>لا توجد نتائج للبحث</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                <AnimatePresence>
                  {filtered.map((doc, idx) => {
                    const photoUrl = doc.photo_url ||
                      `https://ui-avatars.com/api/?name=${encodeURIComponent(doc.full_name)}&background=0D9488&color=fff&size=400`;
                    const isExpanded = expandedDoctor === doc.id;

                    return (
                      <motion.div
                        key={doc.id}
                        layout
                        initial={{ opacity: 0, y: 15 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        transition={{ delay: idx * 0.04, duration: 0.3 }}
                        className="bg-white rounded-2xl overflow-hidden border border-primary/5 shadow-sm hover:shadow-md transition-shadow flex flex-col"
                      >
                        {/* Photo strip */}
                        <div className="h-44 relative overflow-hidden">
                          <img
                            src={photoUrl}
                            alt={doc.full_name}
                            className="w-full h-full object-cover object-top"
                          />
                          <div className="absolute inset-0 bg-gradient-to-t from-primary/80 via-transparent to-transparent" />
                          
                          {/* Rating pill */}
                          <div className="absolute bottom-3 right-3 bg-white/95 backdrop-blur-sm px-2 py-1 rounded-xl flex items-center gap-1 shadow-sm">
                            <div className="flex gap-0.5" dir="ltr">{renderStars(doc.rating)}</div>
                            <span className="text-xs font-bold text-primary font-sans">{doc.rating}</span>
                          </div>

                          {/* Specialty pill */}
                          <div className="absolute top-3 right-3 bg-accent/90 text-primary text-xs font-bold font-sans px-2 py-1 rounded-full backdrop-blur-sm">
                            {doc.specialty_ar || doc.specialty}
                          </div>
                        </div>

                        <div className="p-4 flex flex-col flex-grow">
                          {/* Name */}
                          <h3 className="font-heading font-bold text-lg text-primary leading-tight">
                            {doc.full_name_ar || doc.full_name}
                          </h3>
                          <p className="text-xs text-text/40 font-sans mb-2">{doc.full_name}</p>

                          {/* Stats */}
                          <div className="flex gap-3 mb-3">
                            {doc.years_experience && (
                              <div className="flex items-center gap-1 text-xs text-text/60 font-sans">
                                <GraduationCap size={11} className="text-accent" />{doc.years_experience} سنة خبرة
                              </div>
                            )}
                            {doc.patients_count && (
                              <div className="flex items-center gap-1 text-xs text-text/60 font-sans">
                                <Users size={11} className="text-accent" />{doc.patients_count.toLocaleString('ar-EG')}+
                              </div>
                            )}
                          </div>

                          {/* Expandable bio */}
                          <div className={`font-sans text-xs text-text/65 leading-relaxed mb-3 overflow-hidden transition-all duration-300 ${isExpanded ? '' : 'line-clamp-2'}`}>
                            {doc.bio_ar || doc.bio}
                          </div>
                          <button
                            onClick={() => setExpandedDoctor(isExpanded ? null : doc.id)}
                            className="text-xs text-accent font-sans font-bold text-right mb-2 hover:text-primary transition-colors"
                          >
                            {isExpanded ? 'أقل ▲' : 'اقرأ المزيد ▼'}
                          </button>

                          {/* Availability */}
                          {(doc.availability_note_ar || doc.availability_note) && (
                            <div className="flex items-start gap-2 text-xs text-primary/70 bg-primary/5 p-2.5 rounded-xl mb-3 mt-auto">
                              <Clock size={11} className="text-accent mt-0.5 shrink-0" />
                              <span>{doc.availability_note_ar || doc.availability_note}</span>
                            </div>
                          )}

                          {/* Book button */}
                          <button
                            onClick={() => {
                              if (!session) { window.location.href = '/login'; return; }
                              setSelectedDoctor(doc);
                            }}
                            className="w-full bg-primary text-white font-sans font-bold text-sm py-2.5 rounded-xl hover:bg-accent hover:text-primary transition-colors mt-auto"
                          >
                            احجز موعداً الآن
                          </button>
                        </div>
                      </motion.div>
                    );
                  })}
                </AnimatePresence>
              </div>
            )}
          </div>
        </motion.div>
      </motion.div>

      {/* Slot booking modal on top */}
      {selectedDoctor && (
        <BookingModal
          doctor={selectedDoctor}
          session={session}
          onClose={() => setSelectedDoctor(null)}
        />
      )}
    </AnimatePresence>
  );
}
