"use client";

import Link from "next/link";
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
 */
export default function LinkTabs({
  tabs,
  value,
  children,
}: {
  tabs: LinkTab[];
  value: string;
  children: React.ReactNode;
}) {
  return (
    <Tabs value={value} dir="rtl">
      <TabsList className="mb-6">
        {tabs.map((t) => (
          <TabsTrigger key={t.value} value={t.value} asChild>
            <Link href={t.href} scroll={false}>
              {t.icon}
              {t.label}
            </Link>
          </TabsTrigger>
        ))}
      </TabsList>
      <TabsContent value={value}>{children}</TabsContent>
    </Tabs>
  );
}
