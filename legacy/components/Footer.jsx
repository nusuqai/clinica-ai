import React from 'react';
import { Facebook, Twitter, Instagram, Linkedin, MapPin, Phone, Mail } from 'lucide-react';

export default function Footer() {
  return (
    <footer className="bg-primary pt-24 pb-8 rounded-t-[4rem] mt-[-4rem] relative z-20 border-t border-white/10">
      <div className="max-w-7xl mx-auto px-6 lg:px-12">
        
        {/* Top Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-12 lg:gap-8 mb-16">
          
          {/* Right Column: Brand */}
          <div className="space-y-6">
            <a href="#" className="flex items-center gap-3 group w-fit">
              <div className="bg-white/10 p-2.5 rounded-2xl group-hover:bg-white/20 transition-colors">
                 <img src="/logo.png" alt="Clinica AI Logo" className="h-12 w-auto brightness-0 invert opacity-90 object-contain" />
              </div>
              <span className="font-heading font-bold text-3xl text-white leading-none mt-1 shadow-sm">
                Clinica <span className="text-accent delay-150 transition-colors">AI</span>
              </span>
            </a>
            <p className="font-sans text-white/70 leading-relaxed text-sm md:text-base">
              نقدم رعاية صحية متطورة تعتمد على أدق التقنيات الطبية الذكية. حيث تلتقي التكنولوجيا الدقيقة باللمسة الإنسانية.
            </p>
            <div className="flex gap-4">
              <a href="#" className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center text-white/70 hover:bg-accent hover:text-primary transition-all duration-300">
                <Facebook size={20} />
              </a>
              <a href="#" className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center text-white/70 hover:bg-accent hover:text-primary transition-all duration-300">
                <Twitter size={20} />
              </a>
              <a href="#" className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center text-white/70 hover:bg-accent hover:text-primary transition-all duration-300">
                <Instagram size={20} />
              </a>
              <a href="#" className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center text-white/70 hover:bg-accent hover:text-primary transition-all duration-300">
                <Linkedin size={20} />
              </a>
            </div>
          </div>

          {/* Center Column: Quick Links */}
          <div className="space-y-6">
            <h3 className="font-heading font-bold text-2xl text-accent">روابط سريعة</h3>
            <ul className="space-y-4 font-sans font-medium">
              <li>
                <a href="#hero" className="text-white/70 hover:text-white transition-colors flex items-center gap-2 group">
                  <span className="w-0 h-0.5 bg-accent group-hover:w-4 transition-all duration-300" />
                  الرئيسية
                </a>
              </li>
              <li>
                <a href="#services" className="text-white/70 hover:text-white transition-colors flex items-center gap-2 group">
                  <span className="w-0 h-0.5 bg-accent group-hover:w-4 transition-all duration-300" />
                  الخدمات
                </a>
              </li>
              <li>
                <a href="#departments" className="text-white/70 hover:text-white transition-colors flex items-center gap-2 group">
                  <span className="w-0 h-0.5 bg-accent group-hover:w-4 transition-all duration-300" />
                  الأقسام
                </a>
              </li>
              <li>
                <a href="#doctors" className="text-white/70 hover:text-white transition-colors flex items-center gap-2 group">
                  <span className="w-0 h-0.5 bg-accent group-hover:w-4 transition-all duration-300" />
                  الأطباء
                </a>
              </li>
            </ul>
          </div>

          {/* Left Column: Contact */}
          <div className="space-y-6">
            <h3 className="font-heading font-bold text-2xl text-accent">معلومات التواصل</h3>
            <ul className="space-y-5 font-sans font-medium text-white/70">
              <li className="flex gap-4 items-start">
                <MapPin className="text-accent shrink-0 mt-1" size={20} />
                <span>الرياض، طريق الملك فهد، مقابل برج المملكة، المملكة العربية السعودية</span>
              </li>
              <li className="flex gap-4 items-center">
                <Phone className="text-accent shrink-0" size={20} />
                <span dir="ltr">+966 50 123 4567</span>
              </li>
              <li className="flex gap-4 items-center">
                <Mail className="text-accent shrink-0" size={20} />
                <span dir="ltr">info@clinica-ai.com</span>
              </li>
            </ul>
          </div>

        </div>

        {/* Divider */}
        <div className="h-px w-full bg-gradient-to-r from-transparent via-white/10 to-transparent mb-8" />

        {/* Bottom Bar */}
        <div className="flex flex-col md:flex-row items-center justify-between gap-6 font-sans text-sm text-white/50 font-medium pb-2">
          
          <div className="flex items-center gap-6">
            <p>حقوق النشر © {new Date().getFullYear()} Clinica AI. جميع الحقوق محفوظة.</p>
            <div className="hidden md:flex gap-6">
              <a href="#" className="hover:text-white transition-colors">سياسة الخصوصية</a>
              <a href="#" className="hover:text-white transition-colors">الشروط والأحكام</a>
            </div>
          </div>

          {/* System Status Indicator */}
          <div className="flex items-center gap-3 bg-white/5 px-4 py-2 rounded-full border border-white/10">
            <span className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500"></span>
            </span>
            <span className="font-mono text-green-400">النظام يعمل</span>
          </div>

        </div>

      </div>
    </footer>
  );
}
