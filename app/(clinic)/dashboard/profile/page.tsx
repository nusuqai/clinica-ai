import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { ProfileForm } from "@/components/dashboard/profile-form";
import PageHeader from "@/components/admin/page-header";
import { UserCircle } from "lucide-react";

export default async function PatientProfilePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const profile = await prisma.profile.findUnique({
    where: { id: user.id },
    select: { fullName: true, phone: true },
  });

  const fullName = profile?.fullName ?? "";
  const phone = profile?.phone ?? null;
  const email = user.email ?? "";

  const initials =
    fullName
      .split(" ")
      .slice(0, 2)
      .map((w) => w[0])
      .join("") || "م";

  return (
    <div>
      <PageHeader title="الملف الشخصي" subtitle="إدارة بياناتك الشخصية" />

      <div className="max-w-xl">
        {/* Avatar */}
        <div className="mb-8 flex items-center gap-4">
          <div className="flex h-16 w-16 flex-shrink-0 items-center justify-center rounded-2xl bg-primary">
            <span className="font-heading text-xl font-bold text-white">{initials}</span>
          </div>
          <div>
            <p className="font-heading text-lg font-bold text-foreground">{fullName || "المريض"}</p>
            <p className="font-sans text-sm text-muted-foreground">{email}</p>
          </div>
        </div>

        {/* Form */}
        <div className="rounded-2xl border border-border bg-card p-6">
          <div className="mb-6 flex items-center gap-2">
            <UserCircle className="h-5 w-5 text-primary" />
            <h2 className="font-heading font-semibold text-foreground">البيانات الشخصية</h2>
          </div>
          <ProfileForm email={email} defaultFullName={fullName} defaultPhone={phone} />
        </div>
      </div>
    </div>
  );
}
