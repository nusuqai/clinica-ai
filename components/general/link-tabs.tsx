"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export interface LinkTab {
  value: string;
  label: string;
  href: string;
  /** A rendered icon element (component functions can't cross the server/client boundary). */
  icon?: React.ReactNode;
}

/**
 * shadcn Tabs driven by the URL (`?tab=`), for server pages that fetch only the
 * active tab's data: each trigger is a Link, and the server passes just the
 * active panel as `children`.
 *
 * Switching tabs only changes the search params, so Next keeps the old panel up
 * until the server answers. To answer the click at once, the switch runs in a
 * transition: the clicked tab turns active straight away and its entry in
 * `skeletons` replaces the panel until the new one arrives (the page's keyed
 * <Suspense> then shows the same skeleton while the panel's data streams in).
 */
export default function LinkTabs({
  tabs,
  value,
  skeletons,
  children,
}: {
  tabs: LinkTab[];
  value: string;
  /** Per tab value: the skeleton to show while switching to that tab. */
  skeletons?: Partial<Record<string, React.ReactNode>>;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [target, setTarget] = useState<string | null>(null);
  const switching = isPending && target !== null && target !== value;
  const active = switching ? target : value;

  function handleClick(e: React.MouseEvent<HTMLAnchorElement>, tab: LinkTab) {
    // Let the browser handle new-tab / modified clicks.
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    if (tab.value === value && !isPending) return;
    setTarget(tab.value);
    startTransition(() => router.push(tab.href, { scroll: false }));
  }

  return (
    <Tabs value={active} dir="rtl">
      <TabsList className="mb-6">
        {tabs.map((t) => (
          <TabsTrigger key={t.value} value={t.value} asChild>
            <Link href={t.href} scroll={false} onClick={(e) => handleClick(e, t)}>
              {t.icon}
              {t.label}
            </Link>
          </TabsTrigger>
        ))}
      </TabsList>
      <TabsContent value={active}>
        {switching && skeletons?.[active] !== undefined ? skeletons[active] : children}
      </TabsContent>
    </Tabs>
  );
}
