import Link from "next/link";

// Shown when an emailed auth link is invalid or expired (verifyOtp failed in
// /auth/confirm). Kept outside the (auth) layout so it renders standalone.
export default function AuthErrorPage() {
  return (
    <div
      dir="rtl"
      className="flex min-h-screen flex-col items-center justify-center bg-background px-6 text-center"
    >
      <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-red-50">
        <span className="text-3xl">⚠️</span>
      </div>
      <h1 className="mb-3 font-heading text-2xl font-bold text-primary">
        الرابط غير صالح أو منتهي الصلاحية
      </h1>
      <p className="mb-8 max-w-sm font-sans text-sm leading-relaxed text-text/50">
        قد يكون هذا الرابط قد استُخدم من قبل أو انتهت صلاحيته. يمكنك طلب رابط جديد من صفحة نسيت كلمة
        المرور.
      </p>
      <div className="flex items-center gap-3">
        <Link
          href="/forgot-password"
          className="rounded-2xl bg-primary px-6 py-3 font-sans text-sm font-semibold text-white shadow-lg shadow-primary/20 transition-all hover:bg-primary/90"
        >
          طلب رابط جديد
        </Link>
        <Link
          href="/login"
          className="rounded-2xl border border-text/10 bg-white px-6 py-3 font-sans text-sm font-semibold text-primary transition-all hover:bg-text/5"
        >
          تسجيل الدخول
        </Link>
      </div>
    </div>
  );
}
