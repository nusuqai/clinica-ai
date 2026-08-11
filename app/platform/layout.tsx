import { ClinicRequestStatus } from "@prisma/client";
import { requirePlatformAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import PlatformNav from "./_components/platform-nav";

export default async function PlatformLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requirePlatformAdmin();
  const pendingRequests = await prisma.clinicRequest.count({
    where: { status: ClinicRequestStatus.PENDING },
  });

  return (
    <div className="min-h-screen bg-background" dir="rtl">
      <PlatformNav email={user.email} pendingRequests={pendingRequests} />
      <main className="mx-auto max-w-6xl px-4 py-8 md:px-6">{children}</main>
    </div>
  );
}
