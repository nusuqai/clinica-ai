import { redirect } from "next/navigation";
import { requireClinicMember, roleHome } from "@/lib/auth";

// Bare /clinic/{slug} → send the member to their role's home in this clinic.
export default async function ClinicIndexPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const ctx = await requireClinicMember(slug);
  redirect(roleHome(slug, ctx.role));
}
