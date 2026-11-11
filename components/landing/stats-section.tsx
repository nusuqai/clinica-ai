import { Users, CheckCircle, Clock3, Smile, Award } from "lucide-react";

interface Props {
  doctorCount: number;
  appointmentCount: number;
  /** Solo-doctor clinic: years of experience replace the doctor count. */
  solo?: { yearsOfExperience: number | null } | null;
}

export function StatsSection({ doctorCount, appointmentCount, solo = null }: Props) {
  const first = !solo
    ? [{ icon: Users, value: `${doctorCount}+`, label: "طبيب متخصص" }]
    : solo.yearsOfExperience != null
      ? [{ icon: Award, value: `${solo.yearsOfExperience}+`, label: "سنة خبرة" }]
      : [];
  const stats = [
    ...first,
    { icon: CheckCircle, value: `${appointmentCount}+`, label: "موعد مكتمل" },
    { icon: Clock3, value: "24/7", label: "حجز إلكتروني" },
    { icon: Smile, value: "98%", label: "رضا المرضى" },
  ];

  return (
    <section className="bg-primary px-6 py-16">
      <div
        className={`mx-auto grid max-w-6xl grid-cols-2 gap-6 ${
          stats.length === 4 ? "lg:grid-cols-4" : "lg:grid-cols-3"
        }`}
      >
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <div key={stat.label} className="flex flex-col items-center text-center">
              <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-accent/20">
                <Icon className="h-6 w-6 text-accent" />
              </div>
              <div className="font-heading text-3xl font-extrabold text-white">{stat.value}</div>
              <div className="mt-1 font-sans text-sm text-white/50">{stat.label}</div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
