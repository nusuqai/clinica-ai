import { Users, CheckCircle, Clock3, Smile } from "lucide-react";

interface Props {
  doctorCount: number;
  appointmentCount: number;
}

export function StatsSection({ doctorCount, appointmentCount }: Props) {
  const stats = [
    { icon: Users, value: `${doctorCount}+`, label: "طبيب متخصص" },
    { icon: CheckCircle, value: `${appointmentCount}+`, label: "موعد مكتمل" },
    { icon: Clock3, value: "24/7", label: "حجز إلكتروني" },
    { icon: Smile, value: "98%", label: "رضا المرضى" },
  ];

  return (
    <section className="bg-primary px-6 py-16">
      <div className="mx-auto grid max-w-6xl grid-cols-2 gap-6 lg:grid-cols-4">
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <div
              key={stat.label}
              className="flex flex-col items-center text-center"
            >
              <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-accent/20">
                <Icon className="h-6 w-6 text-accent" />
              </div>
              <div className="font-heading text-3xl font-extrabold text-white">
                {stat.value}
              </div>
              <div className="mt-1 font-sans text-sm text-white/50">
                {stat.label}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
