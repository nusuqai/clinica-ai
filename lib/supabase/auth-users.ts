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
export async function findAuthUserIdByEmail(
  email: string,
): Promise<string | null> {
  const rows = await prisma.$queryRaw<{ id: string }[]>`
    SELECT id::text AS id
    FROM auth.users
    WHERE lower(email) = lower(${email})
    LIMIT 1
  `;
  return rows[0]?.id ?? null;
}
