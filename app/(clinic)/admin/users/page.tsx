import { redirect } from "next/navigation";

// The mixed "users" list was split in two: patients (/admin/patients) and the
// clinic's team (/admin/team). Old links and bookmarks land on patients.
export default function AdminUsersRedirect() {
  redirect("/admin/patients");
}
