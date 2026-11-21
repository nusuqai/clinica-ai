"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export interface SectionTab {
  href: string;
  label: string;
}

/** Route-based tabs for the catalog section (services / packages / offers). */
export default function SectionTabs({ tabs }: { tabs: SectionTab[] }) {
  const pathname = usePathname();
  // The longest matching href wins, so /admin/services doesn't light up on /admin/services/offers.
  const active = [...tabs]
    .sort((a, b) => b.href.length - a.href.length)
    .find((t) => pathname === t.href || pathname.startsWith(`${t.href}/`))?.href;

  if (tabs.length < 2) return null;
  return (
    <nav className="mb-6 inline-flex w-fit items-center gap-1 rounded-xl border border-border bg-muted/40 p-1">
      {tabs.map((t) => (
        <Link
          key={t.href}
          href={t.href}
          aria-current={active === t.href ? "page" : undefined}
          className={cn(
            "whitespace-nowrap rounded-lg px-4 py-2 font-sans text-sm font-medium text-muted-foreground transition-all hover:text-foreground",
            active === t.href && "bg-card text-foreground shadow-sm"
          )}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
