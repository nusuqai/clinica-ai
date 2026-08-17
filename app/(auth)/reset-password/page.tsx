import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import SetPasswordForm from "../_components/set-password-form";

export default async function ResetPasswordPage() {
  // Reachable only with an active recovery session (opened by /auth/confirm).
  // Anyone arriving without one is bounced to request a fresh reset link.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/forgot-password");

  return (
    <SetPasswordForm
      title="إعادة تعيين كلمة المرور 🔐"
      subtitle="اختر كلمة مرور جديدة لحسابك"
      submitLabel="تحديث كلمة المرور"
    />
  );
}
