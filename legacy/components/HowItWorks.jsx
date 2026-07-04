import React from 'react';
import { motion } from 'framer-motion';

const steps = [
  {
    num: '١',
    title: 'التسجيل',
    desc: 'سجّل بياناتك في دقيقة واحدة.',
    Visual: () => (
      <div className="relative w-full h-full flex items-center justify-center">
        <div className="absolute w-48 h-48 border-[1px] border-accent/40 rounded-full animate-[spin_10s_linear_infinite]" />
        <div className="absolute w-32 h-32 border-[1px] border-accent/60 rounded-full animate-[spin_7s_linear_infinite_reverse]" />
        <div className="absolute w-16 h-16 bg-accent rounded-full animate-pulse shadow-[0_0_40px_rgba(0,194,203,0.5)]" />
      </div>
    )
  },
  {
    num: '٢',
    title: 'الاختيار',
    desc: 'اختر طبيبك المناسب من قائمة متخصصينا.',
    Visual: () => (
      <div className="relative w-full h-full flex items-center justify-center overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(0,194,203,0.2)_2px,transparent_2px)] bg-[size:20px_20px] opacity-30" />
        <div className="absolute top-0 bottom-0 left-0 right-0">
            <div className="w-full h-1 bg-accent shadow-[0_0_20px_rgba(0,194,203,1)] animate-[scan_3s_ease-in-out_infinite]" />
        </div>
      </div>
    )
  },
  {
    num: '٣',
    title: 'الحجز',
    desc: 'احجز موعدك وابدأ رحلتك نحو الصحة.',
    Visual: () => (
      <div className="relative w-full h-full flex items-center justify-center pt-10">
        <svg viewBox="0 0 500 200" className="w-full max-w-md stroke-accent stroke-[3px] fill-none drop-shadow-[0_0_8px_rgba(0,194,203,0.8)]">
          <path 
            className="animate-[dash_3s_linear_infinite]"
            strokeDasharray="1000"
            strokeDashoffset="1000"
            d="M 0 100 L 150 100 L 175 50 L 225 180 L 275 20 L 325 100 L 500 100" 
          />
        </svg>
      </div>
    )
  }
];

export default function HowItWorks() {
  return (
    <section id="how-it-works" className="relative bg-background">
      <div className="sticky top-0 h-screen w-full flex items-center justify-center pointer-events-none z-0 opacity-10">
        <div className="text-[15rem] md:text-[25rem] font-heading font-bold text-primary/5 select-none text-center">
          كيف نعمل
        </div>
      </div>

      <div className="relative z-10 w-full max-w-6xl mx-auto px-6 lg:px-12 -mt-[100vh]">
        {steps.map((step, idx) => (
          <motion.div 
            key={idx} 
            className="sticky top-0 h-screen flex items-center justify-center w-full origin-top"
            initial={{ opacity: 0, scale: 0.9, y: 100 }}
            whileInView={{ opacity: 1, scale: 1, y: 0 }}
            viewport={{ once: false, margin: "-10%" }}
            transition={{ duration: 0.5, ease: "easeOut" }}
          >
            <div className="w-full bg-[#0B1F3A] rounded-[3rem] overflow-hidden shadow-2xl border border-white/10 flex flex-col md:flex-row h-[70vh] md:h-[60vh] relative z-20">
              
              {/* Content Panel */}
              <div className="flex-1 p-10 md:p-16 flex flex-col justify-center relative z-10">
                <div className="font-heading font-bold text-accent text-6xl md:text-8xl mb-4 opacity-50">
                  {step.num}
                </div>
                <h3 className="font-heading font-bold text-4xl md:text-5xl text-white mb-6">
                  {step.title}
                </h3>
                <p className="font-sans text-xl md:text-2xl text-white/70 leading-relaxed font-medium">
                  {step.desc}
                </p>
              </div>

              {/* Visual Panel */}
              <div className="flex-1 bg-black/40 relative border-r border-white/10 md:border-r-0 md:border-l">
                <step.Visual />
              </div>

            </div>
          </motion.div>
        ))}
      </div>
      
      {/* Spacer to allow scrolling past the sticky cards naturally */}
      <div className="h-[20vh] w-full" />
    </section>
  );
}
