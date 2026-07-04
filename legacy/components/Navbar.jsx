import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Menu, X } from 'lucide-react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import DoctorBrowserModal from './DoctorBrowserModal';

export default function Navbar() {
  const [isScrolled, setIsScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [browserOpen, setBrowserOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const [session, setSession] = useState(null);
  const [userName, setUserName] = useState('');

  const isHome = location.pathname === '/';

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session?.user) {
        setUserName(session.user.user_metadata?.full_name || session.user.email.split('@')[0]);
      }
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session?.user) {
        setUserName(session.user.user_metadata?.full_name || session.user.email.split('@')[0]);
      } else {
        setUserName('');
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 50);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const handleNavClick = (e, targetHash) => {
    e.preventDefault();
    setMobileMenuOpen(false);
    if (!isHome) {
      navigate(`/${targetHash}`);
    } else {
      const el = document.querySelector(targetHash);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth' });
      }
    }
  };

  return (
    <div className="fixed top-4 left-0 right-0 z-40 flex justify-center px-4 w-full">
      <nav
        className={`transition-all duration-500 ease-[cubic-bezier(0.25,0.46,0.45,0.94)] flex items-center justify-between px-6 py-3 rounded-full w-full max-w-5xl ${
          isScrolled || mobileMenuOpen
            ? 'bg-background/80 backdrop-blur-xl border border-primary/10 shadow-lg'
            : 'bg-transparent'
        }`}
      >
        {/* Logo */}
          <a href="#" className="flex items-center gap-3 group z-50">
            <div className=" p-2 rounded-2xl group-hover:bg-primary/10 transition-colors">
               <img src="/logo.png" alt="Clinica AI Logo" className="h-10 w-auto object-contain" />
            </div>
            <span className="font-heading font-bold text-2xl md:text-3xl text-primary leading-none mt-1">
              Clinica <span className="text-accent">AI</span>
            </span>
          </a>
        {/* Desktop Links */}
        <div className="hidden md:flex items-center gap-8 font-sans font-medium text-text">
          <a href="#hero" onClick={(e) => handleNavClick(e, '#hero')} className="hover:-translate-y-[1px] transition-transform duration-300">الرئيسية</a>
          <a href="#services" onClick={(e) => handleNavClick(e, '#services')} className="hover:-translate-y-[1px] transition-transform duration-300">الخدمات</a>
          <a href="#departments" onClick={(e) => handleNavClick(e, '#departments')} className="hover:-translate-y-[1px] transition-transform duration-300">الأقسام</a>
          <a href="#doctors" onClick={(e) => handleNavClick(e, '#doctors')} className="hover:-translate-y-[1px] transition-transform duration-300">الأطباء</a>
        </div>

        {/* Desktop CTA */}
        <div className="hidden md:flex items-center gap-3 relative z-50">
          {session ? (
            <Link
              to="/dashboard"
              className="text-primary font-sans font-medium px-4 py-2 hover:text-accent transition-colors duration-300"
            >
              أهلاً، {userName}
            </Link>
          ) : (
            <Link
              to="/login"
              className="text-primary font-sans font-medium px-4 py-2 hover:text-accent transition-colors duration-300"
            >
              تسجيل الدخول
            </Link>
          )}
          <button
            onClick={() => setBrowserOpen(true)}
            className="bg-accent text-white font-sans font-medium px-6 py-2.5 rounded-full hover:scale-[1.03] transition-transform duration-300 ease-[cubic-bezier(0.25,0.46,0.45,0.94)] inline-block shadow-md hover:shadow-lg"
          >
            احجز موعد
          </button>
        </div>

        {/* Mobile Menu Toggle */}
        <button
          className="md:hidden text-primary p-2 focus:outline-none"
          onClick={() => setMobileMenuOpen(true)}
        >
          <Menu size={28} />
        </button>
      </nav>

      {/* Mobile Drawer */}
      <AnimatePresence>
        {mobileMenuOpen && (
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'tween', duration: 0.4, ease: 'easeInOut' }}
            className="fixed inset-y-0 right-0 w-64 bg-background shadow-2xl z-50 border-l border-primary/10 flex flex-col"
          >
            <div className="flex justify-start p-6">
              <button
                className="text-primary hover:rotate-90 transition-transform duration-300 focus:outline-none"
                onClick={() => setMobileMenuOpen(false)}
              >
                <X size={28} />
              </button>
            </div>
            <div className="flex flex-col gap-6 px-8 py-4 font-sans font-medium text-lg text-text">
              <a href="#hero" onClick={(e) => handleNavClick(e, '#hero')}>الرئيسية</a>
              <a href="#services" onClick={(e) => handleNavClick(e, '#services')}>الخدمات</a>
              <a href="#departments" onClick={(e) => handleNavClick(e, '#departments')}>الأقسام</a>
              <a href="#doctors" onClick={(e) => handleNavClick(e, '#doctors')}>الأطباء</a>
              
              <div className="mt-4 flex flex-col gap-4">
                {session ? (
                  <Link
                    to="/dashboard"
                    onClick={() => setMobileMenuOpen(false)}
                    className="text-center font-sans font-medium text-primary hover:text-accent transition-colors"
                  >
                    أهلاً، {userName}
                  </Link>
                ) : (
                  <Link
                    to="/login"
                    onClick={() => setMobileMenuOpen(false)}
                    className="text-center font-sans font-medium text-primary hover:text-accent transition-colors"
                  >
                    تسجيل الدخول
                  </Link>
                )}
                <button
                  onClick={() => { setMobileMenuOpen(false); setBrowserOpen(true); }}
                  className="bg-accent text-white font-sans font-medium px-6 py-3 rounded-full hover:scale-[1.03] transition-transform block text-center shadow-md w-full"
                >
                  احجز موعد
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Mobile Overlay */}
      <AnimatePresence>
        {mobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-primary/20 backdrop-blur-sm z-40 md:hidden"
            onClick={() => setMobileMenuOpen(false)}
          />
        )}
      </AnimatePresence>
      {/* Doctor Browser Modal */}
      {browserOpen && (
        <DoctorBrowserModal
          session={session}
          onClose={() => setBrowserOpen(false)}
        />
      )}
    </div>
  );
}
