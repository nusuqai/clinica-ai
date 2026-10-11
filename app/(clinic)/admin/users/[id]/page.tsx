import { redirect } from "next/navigation";

// Old patient-profile links (see ../page.tsx) keep working.
export default async function AdminUserRedirect({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/admin/patients/${id}`);
}
