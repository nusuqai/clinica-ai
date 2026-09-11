/** Labelled text input used across the WhatsApp admin forms. */
export function Field({
  label,
  value,
  onChange,
  placeholder,
  dir = "ltr",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  dir?: "ltr" | "rtl";
}) {
  return (
    <div>
      <label className="mb-1 block font-sans text-xs text-muted-foreground">{label}</label>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-accent"
        dir={dir}
      />
    </div>
  );
}
