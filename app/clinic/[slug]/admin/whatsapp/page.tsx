import { redirect } from "next/navigation";

// The WhatsApp area is now split into Templates / Configuration / Guide pages.
// Land on Templates by default so old links (and the sidebar parent) resolve.
export default async function WhatsAppIndexPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  redirect(`/clinic/${slug}/admin/whatsapp/templates`);
}
