import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import SetPasswordForm from "../_components/set-password-form";

export default async function SetPasswordPage() {
  // Reachable only with an active invite session (opened by /auth/confirm).
  // Without one there's nothing to authorize the password, so send to login.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return (
    <SetPasswordForm
      title="مرحباً بك 👋"
      subtitle="عيّن كلمة المرور الخاصة بك للبدء في استخدام حسابك"
      submitLabel="حفظ وتفعيل الحساب"
    />
  );
}
