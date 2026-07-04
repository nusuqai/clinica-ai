import React from 'react';
import { motion } from 'framer-motion';
import { ShieldCheck, LogIn, UserPlus } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

/**
 * Inline auth prompt card displayed inside the chatbot when the backend
 * returns { type: 'auth_required', message: '...' }.
 */
export default function AuthPromptCard({ message }) {
  const navigate = useNavigate();

  return (
    <motion.div
      initial={{ opacity: 0, y: 10, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: 'spring', damping: 22, stiffness: 260 }}
      className="w-full"
    >
      <div className="relative overflow-hidden rounded-2xl border border-accent/20 bg-gradient-to-br from-white via-accent/[0.04] to-primary/[0.04] shadow-lg shadow-accent/5">
        {/* Decorative glow */}
        <div className="absolute -top-8 -left-8 w-24 h-24 rounded-full bg-accent/10 blur-2xl pointer-events-none" />
        <div className="absolute -bottom-6 -right-6 w-20 h-20 rounded-full bg-primary/5 blur-xl pointer-events-none" />

        <div className="relative p-5 flex flex-col items-center text-center gap-3">
          {/* Icon */}
          <div className="w-12 h-12 rounded-xl bg-accent/10 flex items-center justify-center">
            <ShieldCheck size={24} className="text-accent" />
          </div>

          {/* Title */}
          <h4 className="font-heading font-bold text-primary text-base leading-snug">
            تسجيل الدخول مطلوب
          </h4>

          {/* Server message */}
          <p className="font-sans text-text/60 text-sm leading-relaxed max-w-[260px]">
            {message || 'يرجى تسجيل الدخول للوصول إلى هذه الخدمة.'}
          </p>

          {/* Action buttons */}
          <div className="flex items-center gap-2 mt-1 w-full">
            <button
              onClick={() => navigate('/login')}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-primary text-white font-sans text-sm font-medium rounded-xl hover:bg-primary/90 transition-colors"
            >
              <LogIn size={16} />
              <span>سجل الدخول</span>
            </button>

            <button
              onClick={() => navigate('/login')}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-accent/10 text-primary font-sans text-sm font-medium rounded-xl border border-accent/20 hover:bg-accent/20 transition-colors"
            >
              <UserPlus size={16} />
              <span>إنشاء حساب</span>
            </button>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
