import Link from "next/link";

// Shown when an emailed auth link is invalid or expired (verifyOtp failed in
// /auth/confirm). Kept outside the (auth) layout so it renders standalone.
export default function AuthErrorPage() {
  return (
    <div
      dir="rtl"
      className="min-h-screen flex flex-col items-center justify-center bg-background px-6 text-center"
    >
      <div className="w-16 h-16 rounded-2xl bg-red-50 flex items-center justify-center mb-6">
        <span className="text-3xl">⚠️</span>
      </div>
      <h1 className="text-2xl font-heading font-bold text-primary mb-3">
        الرابط غير صالح أو منتهي الصلاحية
      </h1>
      <p className="text-text/50 font-sans text-sm leading-relaxed max-w-sm mb-8">
        قد يكون هذا الرابط قد استُخدم من قبل أو انتهت صلاحيته. يمكنك طلب رابط جديد
        من صفحة نسيت كلمة المرور.
      </p>
      <div className="flex items-center gap-3">
        <Link
          href="/forgot-password"
          className="py-3 px-6 rounded-2xl text-sm font-semibold text-white bg-primary hover:bg-primary/90 transition-all font-sans shadow-lg shadow-primary/20"
        >
          طلب رابط جديد
        </Link>
        <Link
          href="/login"
          className="py-3 px-6 rounded-2xl text-sm font-semibold text-primary bg-white border border-text/10 hover:bg-text/5 transition-all font-sans"
        >
          تسجيل الدخول
        </Link>
      </div>
    </div>
  );
}
