import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Star, Users, Clock, GraduationCap } from 'lucide-react';
import { motion } from 'framer-motion';
import BookingModal from './BookingModal';

export default function DoctorsShowcase() {
  const [doctors, setDoctors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedDoctor, setSelectedDoctor] = useState(null);
  const [session, setSession] = useState(null);

  useEffect(() => {
    async function init() {
      const { data: { session } } = await supabase.auth.getSession();
      setSession(session);

      const { data, error } = await supabase.from('doctors').select('*').limit(8);
      if (!error) setDoctors(data);
      setLoading(false);
    }
    init();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => subscription.unsubscribe();
  }, []);

  const renderStars = (rating) => {
    const filled = Math.floor(rating || 5);
    return Array.from({ length: 5 }, (_, i) => (
      <Star key={i} size={14} className={i < filled ? "fill-accent text-accent" : "text-gray-300"} />
    ));
  };

  const containerVariants = {
    hidden: {},
    visible: { transition: { staggerChildren: 0.12 } }
  };

  const cardVariants = {
    hidden: { y: 40, opacity: 0 },
    visible: { y: 0, opacity: 1, transition: { duration: 0.5, ease: "easeOut" } }
  };

  return (
    <>
      <section id="doctors" className="py-24 bg-white relative">
        <div className="max-w-7xl mx-auto px-6 lg:px-12">
          <div className="text-center mb-16">
            <span className="inline-block px-4 py-1.5 bg-accent/10 text-accent font-sans font-bold text-sm rounded-full mb-4">
              Our Team / فريقنا
            </span>
            <h2 className="font-heading font-bold text-4xl md:text-5xl text-primary mb-4">أطباؤنا المتميزون</h2>
            <p className="font-sans text-xl text-text/70 max-w-2xl mx-auto">
              نخبة من أفضل الأطباء المتخصصين، يجمعون بين الخبرة الطويلة وأحدث التقنيات.
            </p>
          </div>

          {loading ? (
            <div className="flex justify-center items-center h-64">
              <div className="w-12 h-12 border-4 border-primary/20 border-t-accent rounded-full animate-spin" />
            </div>
          ) : doctors.length > 0 ? (
            <motion.div
              className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6"
              variants={containerVariants}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: "-80px" }}
            >
              {doctors.map((doc) => {
                const photoUrl = doc.photo_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(doc.full_name)}&background=0D9488&color=fff&size=400`;

                return (
                  <motion.div
                    key={doc.id}
                    className="bg-background border border-primary/5 rounded-[2rem] overflow-hidden shadow-sm hover:-translate-y-2 hover:shadow-xl transition-all duration-300 group flex flex-col"
                    variants={cardVariants}
                  >
                    {/* Photo */}
                    <div className="h-56 overflow-hidden relative shrink-0">
                      <img
                        src={photoUrl}
                        alt={doc.full_name}
                        className="w-full h-full object-cover object-top group-hover:scale-105 transition-transform duration-700"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-primary/90 via-primary/20 to-transparent" />

                      {/* Rating overlay */}
                      <div className="absolute bottom-3 right-3 bg-white/95 backdrop-blur-sm px-2.5 py-1 rounded-xl flex items-center gap-1 shadow-sm">
                        <div className="flex gap-0.5" dir="ltr">{renderStars(doc.rating)}</div>
                        <span className="text-xs font-bold text-primary font-sans ml-1">{doc.rating}</span>
                      </div>
                    </div>

                    <div className="p-5 flex flex-col flex-grow">
                      {/* Specialty badge */}
                      <div className="inline-block px-2.5 py-1 bg-accent/10 text-accent font-sans text-xs font-bold rounded-full mb-3 w-fit">
                        {doc.specialty_ar || doc.specialty}
                      </div>

                      {/* Name bilingual */}
                      <h3 className="font-heading font-bold text-xl text-primary leading-tight">
                        {doc.full_name_ar || doc.full_name}
                      </h3>
                      <p className="text-xs font-sans text-text/50 mb-2">{doc.full_name}</p>

                      {/* Stats */}
                      {(doc.years_experience || doc.patients_count) && (
                        <div className="flex gap-3 mb-3">
                          {doc.years_experience && (
                            <div className="flex items-center gap-1 text-xs text-text/60 font-sans">
                              <GraduationCap size={12} className="text-accent" />
                              <span>{doc.years_experience} سنة</span>
                            </div>
                          )}
                          {doc.patients_count && (
                            <div className="flex items-center gap-1 text-xs text-text/60 font-sans">
                              <Users size={12} className="text-accent" />
                              <span>{doc.patients_count.toLocaleString('ar-EG')}+ مريض</span>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Bio */}
                      {(doc.bio_ar || doc.bio) && (
                        <p className="font-sans text-text/65 text-xs mb-4 line-clamp-3 leading-relaxed flex-grow">
                          {doc.bio_ar || doc.bio}
                        </p>
                      )}

                      {/* Availability */}
                      {(doc.availability_note_ar || doc.availability_note) && (
                        <div className="flex items-center gap-2 text-xs text-primary/80 mb-4 bg-primary/5 p-2.5 rounded-xl mt-auto">
                          <Clock size={12} className="text-accent shrink-0 animate-pulse" />
                          <span className="leading-relaxed">{doc.availability_note_ar || doc.availability_note}</span>
                        </div>
                      )}

                      {/* Book button */}
                      <button
                        onClick={() => {
                          if (!session) { window.location.href = '/login'; return; }
                          setSelectedDoctor(doc);
                        }}
                        className="w-full block text-center bg-primary text-white font-sans font-medium text-sm py-2.5 rounded-xl hover:bg-accent hover:text-primary transition-colors duration-300 mt-auto"
                      >
                        احجز مع الدكتور
                      </button>
                    </div>
                  </motion.div>
                );
              })}
            </motion.div>
          ) : (
            <div className="text-center py-12">
              <p className="font-sans text-xl text-text/60">لا يوجد أطباء متاحين حالياً.</p>
            </div>
          )}
        </div>
      </section>

      {/* Booking Modal */}
      {selectedDoctor && (
        <BookingModal
          doctor={selectedDoctor}
          session={session}
          onClose={() => setSelectedDoctor(null)}
        />
      )}
    </>
  );
}
