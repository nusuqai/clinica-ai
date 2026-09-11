import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowRight, Phone, Mail, Calendar, ShieldCheck, ShieldAlert } from "lucide-react";
import { Role } from "@prisma/client";
import { requireActiveMember } from "@/lib/auth";
import { getClinicUser } from "@/server/services/users";
import EditPatientModal from "./_components/edit-patient-modal";

const ROLE_LABEL: Record<Role, string> = {
  [Role.PATIENT]: "مريض",
  [Role.DOCTOR]: "طبيب",
  [Role.ADMIN]: "مدير العيادة",
};

interface PageProps {
  params: Promise<{ slug: string; id: string }>;
}

export default async function UserDetailPage({ params }: PageProps) {
  const { slug, id } = await params;
  const { clinic } = await requireActiveMember(["ADMIN"]);
  const base = `/clinic/${slug}`;

  const user = await getClinicUser(id, clinic.id);
  if (!user) notFound();

  const initials = user.fullName
    .split(" ")
    .slice(0, 2)
    .map((n) => n[0])
    .join("");

  return (
    <div>
      <Link
        href={`${base}/admin/users`}
        className="mb-6 inline-flex items-center gap-1.5 font-sans text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowRight className="h-4 w-4" />
        العودة إلى المستخدمين
      </Link>

      <div className="rounded-2xl border border-border bg-card p-6">
        <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center">
          <div className="flex h-16 w-16 flex-shrink-0 items-center justify-center rounded-2xl bg-primary/10">
            <span className="font-sans text-xl font-bold text-primary">{initials}</span>
          </div>

          <div className="min-w-0 flex-1">
            <div className="mb-1 flex flex-wrap items-center gap-2">
              <h1 className="font-heading text-2xl font-bold text-foreground">{user.fullName}</h1>
              <span className="inline-flex items-center rounded-full bg-primary/10 px-2.5 py-0.5 font-sans text-xs font-medium text-primary">
                {ROLE_LABEL[user.role]}
              </span>
              {user.claimed ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 font-sans text-xs font-medium text-emerald-700">
                  <ShieldCheck className="h-3 w-3" />
                  حساب مُفعّل
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 font-sans text-xs font-medium text-amber-700">
                  <ShieldAlert className="h-3 w-3" />
                  عبر واتساب (لم يُفعّل الدخول للموقع)
                </span>
              )}
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-4">
              {user.claimed && user.email && (
                <span
                  className="flex items-center gap-1.5 font-sans text-sm text-muted-foreground"
                  dir="ltr"
                >
                  <Mail className="h-3.5 w-3.5" />
                  {user.email}
                </span>
              )}
              {user.phone && (
                <span
                  className="flex items-center gap-1.5 font-sans text-sm text-muted-foreground"
                  dir="ltr"
                >
                  <Phone className="h-3.5 w-3.5" />
                  {user.phone}
                </span>
              )}
              <span className="flex items-center gap-1.5 font-sans text-sm text-muted-foreground">
                <Calendar className="h-3.5 w-3.5" />
                {user.appointmentCount} موعد إجمالاً
              </span>
            </div>
          </div>

          <div className="flex-shrink-0">
            <EditPatientModal
              userId={user.id}
              fullName={user.fullName}
              phone={user.phone}
              email={user.email}
              claimed={user.claimed}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
