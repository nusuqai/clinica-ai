import { can, requirePermission } from "@/lib/auth";
import SectionTabs, { type SectionTab } from "./_components/section-tabs";

// The catalog section: services (and packages) under "services", offers under
// their own "offers" permission — a marketing role may run offers without
// touching services or prices.
export default async function ServicesSectionLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requirePermission(["services", "offers"]);
  const tabs: SectionTab[] = [
    ...(can(ctx, "services")
      ? [
          { href: "/admin/services", label: "الخدمات" },
          { href: "/admin/services/packages", label: "الباقات" },
        ]
      : []),
    ...(can(ctx, "offers") ? [{ href: "/admin/services/offers", label: "العروض" }] : []),
  ];
  return (
    <div>
      <SectionTabs tabs={tabs} />
      {children}
    </div>
  );
}
