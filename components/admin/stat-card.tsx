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
    <div className="bg-card border border-border rounded-2xl p-5 flex items-center gap-4">
      <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 ${colorMap[color]}`}>
        <Icon className="w-6 h-6" />
      </div>
      <div>
        <p className="text-2xl font-bold font-heading text-foreground">{value}</p>
        <p className="text-sm text-muted-foreground font-sans">{label}</p>
      </div>
    </div>
  );
}
