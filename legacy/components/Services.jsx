import React from 'react';
import { motion } from 'framer-motion';
import { Stethoscope, Activity, HeartPulse, Home, Pill, Microscope } from 'lucide-react';

export default function Services() {
  const services = [
    {
      title: 'الاستشارات الطبية',
      description: 'نخبة من الأطباء المتخصصين لتقديم الاستشارات الطبية الدقيقة، والتشخيص المبكر لمختلف الحالات الصحية.',
      icon: <Stethoscope size={32} />
    },
    {
      title: 'التحاليل والأشعة',
      description: 'أحدث أجهزة الأشعة التشخيصية والمختبرات المجهزة لضمان حصولك على نتائج دقيقة في أسرع وقت.',
      icon: <Microscope size={32} />
    },
    {
      title: 'الطوارئ 24/7',
      description: 'طاقم طبي متخصص متواجد على مدار الساعة للتعامل مع كافة الحالات الطارئة بسرعة وكفاءة.',
      icon: <HeartPulse size={32} />
    },
    {
      title: 'الرعاية المنزلية',
      description: 'خدمات التمريض والعلاج الطبيعي ورعاية كبار السن في راحة منازلهم بواسطة فريق معتمد.',
      icon: <Home size={32} />
    },
    {
      title: 'الصيدلية الذكية',
      description: 'توفير جميع الأدوية والمستلزمات الطبية الموصوفة مع خدمة التوصيل وتتبع الجرعات آلياً.',
      icon: <Pill size={32} />
    },
    {
      title: 'العيادات التخصصية',
      description: 'عيادات مجهزة بالكامل لتخصصات العيون، الأسنان، الجلدية، والقلب، ومتابعة الأمراض المزمنة.',
      icon: <Activity size={32} />
    }
  ];

  const containerVariants = {
    hidden: {},
    visible: {
      transition: {
        staggerChildren: 0.1
      }
    }
  };

  const cardVariants = {
    hidden: { y: 50, opacity: 0 },
    visible: {
      y: 0,
      opacity: 1,
      transition: { duration: 0.6, ease: "easeOut" }
    }
  };

  return (
    <section id="services" className="py-32 px-6 lg:px-12 bg-background relative z-20">
      <div className="max-w-7xl mx-auto">
        <div className="text-center mb-20">
          <h2 className="font-heading font-bold text-4xl md:text-5xl text-primary mb-6">خدماتنا المتميزة</h2>
          <p className="font-sans text-lg md:text-xl text-text/70 max-w-2xl mx-auto font-medium leading-relaxed">
            نقدم مجموعة متكاملة من الخدمات الطبية المعتمدة على أدق التقنيات الحديثة وتحت إشراف كادر طبي متخصص لضمان حصولك على أفضل رعاية صحية.
          </p>
        </div>

        <motion.div 
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8"
          variants={containerVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-100px" }}
        >
          {services.map((service, idx) => (
            <motion.div 
              key={idx} 
              variants={cardVariants}
              className="group bg-white border border-primary/5 rounded-[2rem] p-8 shadow-sm hover:shadow-xl hover:-translate-y-2 transition-all duration-300 relative overflow-hidden"
            >
              <div className="absolute top-0 right-0 w-32 h-32 bg-accent/5 rounded-full blur-3xl -mr-16 -mt-16 group-hover:bg-accent/15 transition-colors duration-500 pointer-events-none" />
              
              <div className="relative z-10">
                <div className="w-16 h-16 rounded-2xl bg-primary/5 text-accent flex items-center justify-center mb-6 group-hover:bg-accent group-hover:text-white transition-colors duration-300">
                  {service.icon}
                </div>
                <h3 className="font-heading font-bold text-2xl text-primary mb-4">{service.title}</h3>
                <p className="font-sans text-text/70 leading-relaxed font-medium">
                  {service.description}
                </p>
              </div>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
