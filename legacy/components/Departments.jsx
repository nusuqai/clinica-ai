import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Stethoscope, Heart, Activity, Brain, Droplet } from 'lucide-react';
import { motion } from 'framer-motion';

const iconMap = {
  'طب عام': <Stethoscope className="w-8 h-8 md:w-10 md:h-10 text-accent mb-4" />,
  'أمراض القلب': <Heart className="w-8 h-8 md:w-10 md:h-10 text-accent mb-4" />,
  'طب الأعصاب': <Brain className="w-8 h-8 md:w-10 md:h-10 text-accent mb-4" />,
  'الأمراض الجلدية': <Activity className="w-8 h-8 md:w-10 md:h-10 text-accent mb-4" />,
  'الغدد الصماء': <Droplet className="w-8 h-8 md:w-10 md:h-10 text-accent mb-4" />,
  'default': <Stethoscope className="w-8 h-8 md:w-10 md:h-10 text-accent mb-4" />
};

const specialtyMap = {
  'General Practitioner': 'طب عام',
  'Cardiologist': 'أمراض القلب',
  'Dermatologist': 'الأمراض الجلدية',
  'Neurologist': 'طب الأعصاب',
  'Endocrinologist': 'الغدد الصماء'
};

export default function Departments() {
  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchDepartments() {
      try {
        const { data, error } = await supabase.from('doctors').select('specialty');
        if (error) throw error;
        
        // Group by specialty
        const counts = data.reduce((acc, curr) => {
          const spec = curr.specialty;
          const arabicSpec = specialtyMap[spec] || spec;
          acc[arabicSpec] = (acc[arabicSpec] || 0) + 1;
          return acc;
        }, {});

        const deptArray = Object.entries(counts).map(([name, count]) => ({
          name,
          count
        }));

        setDepartments(deptArray);
      } catch (err) {
        console.error('Error fetching departments:', err);
      } finally {
        setLoading(false);
      }
    }
    fetchDepartments();
  }, []);

  const containerVariants = {
    hidden: {},
    visible: {
      transition: { staggerChildren: 0.1 }
    }
  };

  const cardVariants = {
    hidden: { y: 50, opacity: 0 },
    visible: { y: 0, opacity: 1, transition: { duration: 0.6, ease: "easeOut" } }
  };

  return (
    <section id="departments" className="py-24 bg-background relative border-t border-primary/5">
      <div className="max-w-7xl mx-auto px-6 lg:px-12">
        <div className="flex flex-col md:flex-row md:items-end justify-between mb-16 gap-6">
          <div>
            <h2 className="font-heading font-bold text-4xl text-primary mb-4">أقسام العيادة</h2>
            <p className="font-sans text-lg text-text/70 max-w-lg">
              تغطي أقسامنا التخصصية كافة الاحتياجات الطبية لتوفير رعاية صحية متكاملة لجميع أفراد الأسرة.
            </p>
          </div>
          <a href="#book" className="text-accent font-sans font-medium hover:text-primary transition-colors flex items-center gap-2">
            احجز استشارة الآن <span className="text-xl leading-none">&larr;</span>
          </a>
        </div>

        {loading ? (
          <div className="flex justify-center items-center h-48">
            <div className="w-12 h-12 border-4 border-primary/20 border-t-accent rounded-full animate-spin" />
            <span className="sr-only">جاري التحميل...</span>
          </div>
        ) : (
          <motion.div 
            className="flex overflow-x-auto pb-8 -mx-6 px-6 lg:mx-0 lg:px-0 lg:grid lg:grid-cols-3 xl:grid-cols-4 gap-6 scrollbar-hide snap-x"
            variants={containerVariants}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-100px" }}
          >
            {departments.map((dept, idx) => (
              <motion.div 
                key={idx} 
                className="group bg-white border border-primary/10 rounded-3xl p-8 flex-shrink-0 w-72 lg:w-auto hover:border-accent hover:shadow-lg hover:-translate-y-2 transition-all duration-300 ease-[cubic-bezier(0.25,0.46,0.45,0.94)] snap-center cursor-pointer"
                variants={cardVariants}
              >
                {iconMap[dept.name] || iconMap['default']}
                <h3 className="font-heading font-bold text-2xl text-primary mb-2 group-hover:text-accent transition-colors">{dept.name}</h3>
                <p className="font-sans text-text/60 font-medium">{dept.count} أطباء متاحون</p>
              </motion.div>
            ))}
          </motion.div>
        )}
      </div>
    </section>
  );
}
