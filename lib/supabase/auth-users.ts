import "server-only";
import { prisma } from "@/lib/prisma";

// Targeted lookups against Supabase's `auth.users` table. The supabase-js admin
// client has no "get user by email", only `listUsers` (paginated) — scanning all
// users to find one email is wasteful. `auth.users.email` is indexed, so a direct
// query on the same database is far cheaper. Reused by the claim + onboarding
// flows to check whether an email is already taken.

/**
 * Auth user id for an email (case-insensitive), or null if none. Does NOT scan —
 * a single indexed lookup on `auth.users`.
 */
export async function findAuthUserIdByEmail(email: string): Promise<string | null> {
  const rows = await prisma.$queryRaw<{ id: string }[]>`
    SELECT id::text AS id
    FROM auth.users
    WHERE lower(email) = lower(${email})
    LIMIT 1
  `;
  return rows[0]?.id ?? null;
}

/**
 * Email addresses of every platform admin. Identity lives in `auth.users` while
 * the `isPlatformAdmin` flag lives on `public.profiles`, so this joins the two
 * in one query rather than paging the admin API.
 *
 * Used as the default audience for internal platform alerts (e.g. a clinic
 * running out of AI units), so those work with no extra configuration — set
 * PLATFORM_ALERT_EMAIL to send somewhere else instead.
 */
export async function platformAdminEmails(): Promise<string[]> {
  const rows = await prisma.$queryRaw<{ email: string }[]>`
    SELECT u.email AS email
    FROM auth.users u
    JOIN public.profiles p ON p.id = u.id
    WHERE p."isPlatformAdmin" = true AND u.email IS NOT NULL
  `;
  return rows.map((r) => r.email).filter(Boolean);
}
