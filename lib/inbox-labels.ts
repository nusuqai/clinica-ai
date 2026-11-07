// Palette for personal inbox labels. Stored by key (not hex) so the look can be
// retuned in one place. Chips are SOLID so a label is noticeable at a glance in
// a busy list; light hues (amber/yellow/lime) use dark text for contrast.
//
// Colours are applied as inline styles (hex), NOT Tailwind classes: class
// names built from data are invisible to Tailwind's scanner, so some swatches
// rendered transparent. Inline styles always paint.
//
// Keys are persisted on `inbox_labels.color` — never rename or remove one;
// only append.

import type { CSSProperties } from "react";

interface LabelSwatch {
  /** Fill. */
  bg: string;
  /** Text on the fill. */
  fg: string;
  /** A slightly darker edge. */
  border: string;
}

export const LABEL_COLORS = {
  gray: { bg: "#64748b", fg: "#ffffff", border: "#475569" },
  red: { bg: "#ef4444", fg: "#ffffff", border: "#dc2626" },
  orange: { bg: "#f97316", fg: "#ffffff", border: "#ea580c" },
  amber: { bg: "#fbbf24", fg: "#451a03", border: "#f59e0b" },
  green: { bg: "#10b981", fg: "#ffffff", border: "#059669" },
  teal: { bg: "#14b8a6", fg: "#ffffff", border: "#0d9488" },
  blue: { bg: "#0ea5e9", fg: "#ffffff", border: "#0284c7" },
  violet: { bg: "#8b5cf6", fg: "#ffffff", border: "#7c3aed" },
  pink: { bg: "#ec4899", fg: "#ffffff", border: "#db2777" },
  yellow: { bg: "#fde047", fg: "#422006", border: "#facc15" },
  lime: { bg: "#a3e635", fg: "#1a2e05", border: "#84cc16" },
  cyan: { bg: "#06b6d4", fg: "#ffffff", border: "#0891b2" },
  indigo: { bg: "#6366f1", fg: "#ffffff", border: "#4f46e5" },
  purple: { bg: "#9333ea", fg: "#ffffff", border: "#7e22ce" },
  rose: { bg: "#e11d48", fg: "#ffffff", border: "#be123c" },
} as const satisfies Record<string, LabelSwatch>;

export type LabelColor = keyof typeof LABEL_COLORS;

export const LABEL_COLOR_KEYS = Object.keys(LABEL_COLORS) as LabelColor[];

export function isLabelColor(value: unknown): value is LabelColor {
  return typeof value === "string" && value in LABEL_COLORS;
}

function swatch(color: string): LabelSwatch {
  return isLabelColor(color) ? LABEL_COLORS[color] : LABEL_COLORS.gray;
}

/** Inline style for a label chip (fill + text + edge). */
export function labelStyle(color: string): CSSProperties {
  const s = swatch(color);
  return { backgroundColor: s.bg, color: s.fg, borderColor: s.border };
}

/** Inline style for a picker swatch / dot. */
export function labelDotStyle(color: string): CSSProperties {
  return { backgroundColor: swatch(color).bg };
}

/** The text colour that reads on this label's fill (e.g. a check mark). */
export function labelForeground(color: string): string {
  return swatch(color).fg;
}
