import Link from "next/link";
import {
  ArrowRight,
  CalendarCheck,
  CalendarDays,
  Clock,
  FileText,
  LayoutDashboard,
  Mail,
  Phone,
  Stethoscope,
  UserCircle,
} from "lucide-react";
import { requireClinicMember } from "@/lib/auth";
import { getPatientStats } from "@/server/services/appointments";
import { countPatientRecords } from "@/server/services/treatments";
import { ProfileForm } from "@/components/dashboard/profile-form";

// The patient's profile as a page of its own, opened from the avatar in the
// clinic home page's nav. Deliberately outside the dashboard shell: it belongs
// to the public-facing side of the clinic, with a way straight back home.
// Everything shown is scoped to the clinic this host serves.
export default async function PatientProfilePage() {
  // Non-patients are sent to their own role's home.
  const ctx = await requireClinicMember(["PATIENT"]);
  const { user, clinic } = ctx;

  const [stats, recordCount] = await Promise.all([
    getPatientStats(user.id, clinic.id),
    countPatientRecords(clinic.id, user.id),
  ]);

  const fullName = user.profile.fullName;
  const initials =
    fullName
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((w) => w[0])
      .join("") || "م";

  return (
    <div className="min-h-screen bg-muted/40">
      {/* Brand band — same colours as the clinic home page */}
      <header className="bg-primary px-6 pb-24 pt-6">
        <div className="mx-auto flex max-w-4xl items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            {clinic.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={clinic.logoUrl}
                alt={clinic.name}
                className="h-9 w-9 rounded-xl object-cover"
              />
            ) : (
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent">
                <Stethoscope className="h-5 w-5 text-white" />
              </div>
            )}
            <span className="font-heading text-xl font-bold text-white">{clinic.name}</span>
          </Link>
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 rounded-lg border border-white/30 px-3 py-1.5 font-sans text-sm font-medium text-white transition-colors hover:border-accent hover:text-accent"
          >
            <ArrowRight className="h-4 w-4" />
            الرئيسية
          </Link>
        </div>
      </header>

      <main className="mx-auto -mt-16 max-w-4xl space-y-6 px-6 pb-16">
        {/* Identity card */}
        <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
          <div className="flex flex-col items-center gap-4 text-center sm:flex-row sm:text-start">
            <div className="flex h-20 w-20 flex-shrink-0 items-center justify-center rounded-full bg-primary ring-4 ring-card">
              <span className="font-heading text-2xl font-bold text-white">{initials}</span>
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="font-heading text-2xl font-bold text-foreground">
                {fullName || "المريض"}
              </h1>
              <p className="mt-0.5 font-sans text-sm text-muted-foreground">
                مريض في {clinic.name}
              </p>
              <div className="mt-3 flex flex-wrap justify-center gap-x-5 gap-y-1 font-sans text-sm text-muted-foreground sm:justify-start">
                {user.email && (
                  <span className="flex items-center gap-1.5" dir="ltr">
                    <Mail className="h-4 w-4" />
                    {user.email}
                  </span>
                )}
                {user.profile.phone && (
                  <span className="flex items-center gap-1.5" dir="ltr">
                    <Phone className="h-4 w-4" />
                    {user.profile.phone}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* At-a-glance numbers for this clinic */}
          <div className="mt-6 grid grid-cols-2 gap-3 border-t border-border pt-6 sm:grid-cols-4">
            <Stat
              icon={Clock}
              value={stats.upcoming}
              label="موعد قادم"
              tone="bg-blue-500/10 text-blue-600"
            />
            <Stat
              icon={CalendarCheck}
              value={stats.completed}
              label="زيارة مكتملة"
              tone="bg-emerald-500/10 text-emerald-600"
            />
            <Stat
              icon={FileText}
              value={recordCount}
              label="سجل علاجي"
              tone="bg-primary/10 text-primary"
            />
            <Stat
              icon={CalendarDays}
              value={stats.total}
              label="موعد إجمالاً"
              tone="bg-accent/10 text-accent"
            />
          </div>
        </section>

        <div className="grid gap-6 lg:grid-cols-3">
          {/* Edit form */}
          <section className="rounded-2xl border border-border bg-card p-6 shadow-sm lg:col-span-2">
            <div className="mb-6 flex items-center gap-2">
              <UserCircle className="h-5 w-5 text-primary" />
              <h2 className="font-heading font-semibold text-foreground">البيانات الشخصية</h2>
            </div>
            <ProfileForm
              email={user.email}
              defaultFullName={fullName}
              defaultPhone={user.profile.phone}
            />
          </section>

          {/* Quick links */}
          <aside className="space-y-3">
            <QuickLink
              href="/#my-appointments"
              icon={CalendarDays}
              label="مواعيدي"
              hint="القادمة والسابقة والسجل العلاجي"
            />
            <QuickLink href="/#book" icon={Stethoscope} label="احجز موعداً" hint="اختر طبيبك" />
            <QuickLink
              href="/dashboard"
              icon={LayoutDashboard}
              label="لوحة التحكم"
              hint="كل التفاصيل في مكان واحد"
            />
          </aside>
        </div>
      </main>
    </div>
  );
}

function Stat({
  icon: Icon,
  value,
  label,
  tone,
}: {
  icon: React.ElementType;
  value: number;
  label: string;
  tone: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <div
        className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl ${tone}`}
      >
        <Icon className="h-5 w-5" />
      </div>
      <div>
        <p className="font-heading text-xl font-bold leading-none text-foreground">{value}</p>
        <p className="mt-1 font-sans text-xs text-muted-foreground">{label}</p>
      </div>
    </div>
  );
}

function QuickLink({
  href,
  icon: Icon,
  label,
  hint,
}: {
  href: string;
  icon: React.ElementType;
  label: string;
  hint: string;
}) {
  return (
    <Link
      href={href}
      className="group flex items-center gap-3 rounded-2xl border border-border bg-card p-4 shadow-sm transition-colors hover:border-primary/40 hover:bg-primary/5"
    >
      <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground transition-colors group-hover:bg-primary/10 group-hover:text-primary">
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0">
        <p className="font-sans text-sm font-medium text-foreground">{label}</p>
        <p className="font-sans text-xs text-muted-foreground">{hint}</p>
      </div>
    </Link>
  );
}
