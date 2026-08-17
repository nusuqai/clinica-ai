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
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-6 font-sans"
      >
        <ArrowRight className="w-4 h-4" />
        العودة إلى المستخدمين
      </Link>

      <div className="bg-card border border-border rounded-2xl p-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
          <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center flex-shrink-0">
            <span className="text-xl font-bold text-primary font-sans">{initials}</span>
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <h1 className="font-heading text-2xl font-bold text-foreground">
                {user.fullName}
              </h1>
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium font-sans bg-primary/10 text-primary">
                {ROLE_LABEL[user.role]}
              </span>
              {user.claimed ? (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium font-sans bg-emerald-100 text-emerald-700">
                  <ShieldCheck className="w-3 h-3" />
                  حساب مُفعّل
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium font-sans bg-amber-100 text-amber-700">
                  <ShieldAlert className="w-3 h-3" />
                  عبر واتساب (لم يُفعّل الدخول للموقع)
                </span>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-4 mt-2">
              {user.claimed && user.email && (
                <span className="flex items-center gap-1.5 text-sm text-muted-foreground font-sans" dir="ltr">
                  <Mail className="w-3.5 h-3.5" />
                  {user.email}
                </span>
              )}
              {user.phone && (
                <span className="flex items-center gap-1.5 text-sm text-muted-foreground font-sans" dir="ltr">
                  <Phone className="w-3.5 h-3.5" />
                  {user.phone}
                </span>
              )}
              <span className="flex items-center gap-1.5 text-sm text-muted-foreground font-sans">
                <Calendar className="w-3.5 h-3.5" />
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
