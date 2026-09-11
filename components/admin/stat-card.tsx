import type { LucideIcon } from "lucide-react";

interface StatCardProps {
  label: string;
  value: number | string;
  icon: LucideIcon;
  color?: "primary" | "accent" | "green" | "amber" | "red";
}

const colorMap = {
  primary: "bg-primary/10 text-primary",
  accent: "bg-accent/10 text-accent",
  green: "bg-emerald-500/10 text-emerald-600",
  amber: "bg-amber-500/10 text-amber-600",
  red: "bg-red-500/10 text-red-600",
};

export default function StatCard({ label, value, icon: Icon, color = "primary" }: StatCardProps) {
  return (
    <div className="flex items-center gap-4 rounded-2xl border border-border bg-card p-5">
      <div
        className={`flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl ${colorMap[color]}`}
      >
        <Icon className="h-6 w-6" />
      </div>
      <div>
        <p className="font-heading text-2xl font-bold text-foreground">{value}</p>
        <p className="font-sans text-sm text-muted-foreground">{label}</p>
      </div>
    </div>
  );
}
