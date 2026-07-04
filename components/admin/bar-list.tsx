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
          <div className="flex items-center justify-between text-sm font-sans">
            <span className="text-foreground">{item.label}</span>
            <div className="flex items-center gap-2">
              {item.sublabel && <span className="text-muted-foreground text-xs">{item.sublabel}</span>}
              <span className="font-medium text-foreground">{item.value}</span>
            </div>
          </div>
          <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full ${color} transition-all duration-500`}
              style={{ width: `${Math.round((item.value / maxVal) * 100)}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
