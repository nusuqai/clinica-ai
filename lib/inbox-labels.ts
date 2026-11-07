// Palette for personal inbox labels. Stored by key (not hex) so the look can be
// retuned in one place and stays legible in both themes.

export const LABEL_COLORS = {
  gray: "bg-slate-100 text-slate-700 border-slate-300 dark:bg-slate-800 dark:text-slate-200",
  red: "bg-red-100 text-red-700 border-red-300 dark:bg-red-950 dark:text-red-200",
  orange: "bg-orange-100 text-orange-700 border-orange-300 dark:bg-orange-950 dark:text-orange-200",
  amber: "bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-950 dark:text-amber-200",
  green:
    "bg-emerald-100 text-emerald-700 border-emerald-300 dark:bg-emerald-950 dark:text-emerald-200",
  teal: "bg-teal-100 text-teal-700 border-teal-300 dark:bg-teal-950 dark:text-teal-200",
  blue: "bg-sky-100 text-sky-700 border-sky-300 dark:bg-sky-950 dark:text-sky-200",
  violet: "bg-violet-100 text-violet-700 border-violet-300 dark:bg-violet-950 dark:text-violet-200",
  pink: "bg-pink-100 text-pink-700 border-pink-300 dark:bg-pink-950 dark:text-pink-200",
} as const;

export type LabelColor = keyof typeof LABEL_COLORS;

export const LABEL_COLOR_KEYS = Object.keys(LABEL_COLORS) as LabelColor[];

/** Swatch dot colour per key (for the picker). */
export const LABEL_DOT: Record<LabelColor, string> = {
  gray: "bg-slate-500",
  red: "bg-red-500",
  orange: "bg-orange-500",
  amber: "bg-amber-500",
  green: "bg-emerald-500",
  teal: "bg-teal-500",
  blue: "bg-sky-500",
  violet: "bg-violet-500",
  pink: "bg-pink-500",
};

export function isLabelColor(value: unknown): value is LabelColor {
  return typeof value === "string" && value in LABEL_COLORS;
}

export function labelClass(color: string): string {
  return isLabelColor(color) ? LABEL_COLORS[color] : LABEL_COLORS.gray;
}
