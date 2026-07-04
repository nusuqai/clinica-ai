import React from 'react';
import { motion } from 'framer-motion';

export default function Hero() {
  const stats = [
    { label: 'أطباء متخصصون', value: 45 },
    { label: 'مرضى سنويًا', value: 12000 },
    { label: 'سنوات الخبرة', value: 15 },
  ];

  const containerVariants = {
    hidden: {},
    visible: {
      transition: {
        staggerChildren: 0.1,
        delayChildren: 0.2
      }
    }
  };

  const itemVariants = {
    hidden: { y: 40, opacity: 0 },
    visible: { 
      y: 0, 
      opacity: 1, 
      transition: { duration: 0.8, ease: "easeOut" } 
    }
  };

  const statContainerVariants = {
    hidden: {},
    visible: {
      transition: {
        staggerChildren: 0.2,
        delayChildren: 0.8
      }
    }
  };

  const statVariants = {
    hidden: { y: 20, opacity: 0 },
    visible: {
      y: 0,
      opacity: 1,
      transition: { duration: 0.8, ease: "easeOut" }
    }
  };

  return (
    <section id="hero" className="relative min-h-[100dvh] flex items-center justify-start overflow-hidden">
      {/* Background Image & Overlay */}
      <div className="absolute inset-0 z-0 scale-105 transform transition-transform duration-[10000ms] hover:scale-100">
        <img 
          src="https://images.unsplash.com/photo-1519494026892-80bbd2d6fd0d?q=80&w=2053&auto=format&fit=crop" 
          alt="Clinic environment showing modern medical technology"
          className="w-full h-full object-cover object-center"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[#0B1F3A]/95 via-[#0B1F3A]/80 to-[#0B1F3A]/40 mix-blend-multiply" />
        <div className="absolute inset-0 bg-gradient-to-b from-[#0B1F3A]/60 via-transparent to-transparent" />
      </div>

      {/* Content Container */}
      <div className="relative z-10 w-full max-w-7xl mx-auto px-6 lg:px-12 flex flex-col justify-end h-full pt-32 pb-40 xl:pb-32">
        <motion.div 
          className="max-w-3xl space-y-8"
          variants={containerVariants}
          initial="hidden"
          animate="visible"
        >
          <motion.h1 className="text-white" variants={itemVariants}>
            <span className="block font-heading font-bold text-5xl md:text-7xl mb-4 text-[#00C2CB]">الطب الحديث في خدمة</span>
            <span className="block font-serif italic text-6xl md:text-9xl text-[#F0F4F8] leading-tight">مستقبلك.</span>
          </motion.h1>
          
          <motion.p variants={itemVariants} className="font-sans text-xl md:text-2xl text-[#F0F4F8]/80 leading-relaxed max-w-2xl font-medium">
            نقدم رعاية صحية متطورة تعتمد على أدق التقنيات الطبية الذكية. Clinica AI — حيث تلتقي التكنولوجيا الدقيقة باللمسة الإنسانية.
          </motion.p>

          <motion.div variants={itemVariants} className="flex flex-wrap gap-4 pt-6">
            <a 
              href="#book"
              className="px-8 py-4 bg-[#00C2CB] text-[#1C1C1E] font-sans font-bold text-lg rounded-full hover:scale-[1.03] transition-transform duration-300 shadow-lg hover:shadow-[#00C2CB]/30"
            >
              احجز موعدك الآن
            </a>
            <a 
              href="#doctors"
              className="px-8 py-4 bg-transparent border-2 border-[#F0F4F8]/30 text-[#F0F4F8] font-sans font-bold text-lg rounded-full hover:bg-[#F0F4F8]/10 transition-colors duration-300 backdrop-blur-sm"
            >
              تعرف على أطبائنا
            </a>
          </motion.div>
        </motion.div>
      </div>

      {/* Stats Bar */}
      <div className="absolute bottom-0 left-0 right-0 bg-[#0B1F3A]/60 backdrop-blur-lg border-t border-white/10 z-20">
        <motion.div 
          className="max-w-7xl mx-auto px-6 py-8 flex justify-between items-center gap-4 flex-wrap"
          variants={statContainerVariants}
          initial="hidden"
          animate="visible"
        >
          {stats.map((stat, i) => (
            <motion.div key={i} variants={statVariants} className="text-center flex-1">
              <div className="font-heading font-bold text-4xl md:text-5xl text-[#00C2CB] mb-2 flex justify-center items-center select-none cursor-default">
                <span className="text-[#00C2CB] text-3xl md:text-4xl mx-1">+</span>
                <span>{stat.value}</span>
              </div>
              <div className="font-sans text-base md:text-lg text-[#F0F4F8]/80 font-medium">{stat.label}</div>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
