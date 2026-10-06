import Link from "next/link";
import { Button } from "@/components/ui/button";

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
        <Button
          asChild
          className="h-auto rounded-2xl px-6 py-3 text-sm font-semibold shadow-lg shadow-primary/20 transition-all"
        >
          <Link href="/forgot-password">طلب رابط جديد</Link>
        </Button>
        <Button
          asChild
          variant="outline"
          className="h-auto rounded-2xl border-text/10 bg-white px-6 py-3 text-sm font-semibold text-primary transition-all hover:bg-text/5"
        >
          <Link href="/login">تسجيل الدخول</Link>
        </Button>
      </div>
    </div>
  );
}
