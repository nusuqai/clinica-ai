import Link from "next/link";
import { requirePlatformAdmin } from "@/lib/auth";

export default async function PlatformLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requirePlatformAdmin();

  return (
    <div className="min-h-screen bg-background" dir="rtl">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-6">
            <span className="font-heading font-bold text-foreground">
              Nusuq · لوحة المنصة
            </span>
            <nav className="flex items-center gap-4 text-sm font-sans text-muted-foreground">
              <Link href="/platform" className="hover:text-foreground">
                نظرة عامة
              </Link>
              <Link href="/platform/requests" className="hover:text-foreground">
                الطلبات
              </Link>
              <Link href="/platform/clinics" className="hover:text-foreground">
                العيادات
              </Link>
            </nav>
          </div>
          <span className="text-xs text-muted-foreground" dir="ltr">
            {user.email}
          </span>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
    </div>
  );
}
