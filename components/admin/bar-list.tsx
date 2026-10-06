import { Progress } from "@/components/ui/progress";

interface BarListItem {
  label: string;
  sublabel?: string;
  value: number;
}

interface BarListProps {
  items: BarListItem[];
  max?: number;
  color?: string;
}

export default function BarList({ items, max, color = "bg-primary" }: BarListProps) {
  const maxVal = max ?? Math.max(...items.map((i) => i.value), 1);

  return (
    <div className="space-y-3">
      {items.map((item) => (
        <div key={item.label} className="space-y-1">
          <div className="flex items-center justify-between font-sans text-sm">
            <span className="text-foreground">{item.label}</span>
            <div className="flex items-center gap-2">
              {item.sublabel && (
                <span className="text-xs text-muted-foreground">{item.sublabel}</span>
              )}
              <span className="font-medium text-foreground">{item.value}</span>
            </div>
          </div>
          <Progress
            value={Math.round((item.value / maxVal) * 100)}
            className="bg-muted"
            indicatorClassName={`rounded-full ${color} duration-500`}
          />
        </div>
      ))}
    </div>
  );
}
