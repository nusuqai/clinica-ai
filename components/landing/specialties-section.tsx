import {
  HeartPulse,
  Bone,
  Baby,
  Brain,
  Eye,
  Stethoscope,
  Ear,
  Pill,
} from "lucide-react";

const SPECIALTY_ICONS: Record<string, typeof HeartPulse> = {
  قلب: HeartPulse,
  "قلب وأوعية دموية": HeartPulse,
  عظام: Bone,
  أطفال: Baby,
  "مخ وأعصاب": Brain,
  عيون: Eye,
  "أنف وأذن وحنجرة": Ear,
  صيدلة: Pill,
};

function iconFor(specialty: string) {
  return SPECIALTY_ICONS[specialty] ?? Stethoscope;
}

interface Props {
  specialties: { name: string; count: number }[];
}

export function SpecialtiesSection({ specialties }: Props) {
  if (specialties.length === 0) return null;

  return (
    <section className="bg-muted px-6 py-20">
      <div className="mx-auto max-w-7xl">
        <div className="mb-12 text-center">
          <h2 className="font-heading text-3xl font-extrabold text-primary lg:text-4xl">
            التخصصات المتاحة
          </h2>
          <p className="mt-3 font-sans text-base text-text/60">
            نغطي مجموعة واسعة من التخصصات الطبية
          </p>
        </div>

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {specialties.map((spec) => {
            const Icon = iconFor(spec.name);
            return (
              <a
                key={spec.name}
                href="#doctors"
                className="group flex flex-col items-center gap-3 rounded-2xl border border-border bg-white p-6 text-center transition-all hover:-translate-y-1 hover:border-accent/40 hover:shadow-md"
              >
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary transition-colors group-hover:bg-accent">
                  <Icon className="h-6 w-6 text-white" />
                </div>
                <div>
                  <p className="font-sans text-sm font-semibold text-text">
                    {spec.name}
                  </p>
                  <p className="mt-0.5 font-sans text-xs text-text/50">
                    {spec.count} طبيب
                  </p>
                </div>
              </a>
            );
          })}
        </div>
      </div>
    </section>
  );
}
