import "server-only";
import { Prisma } from "@prisma/client";
import { normalizePhone } from "@/lib/phone";

// One "find a person" search for every list: a typed query matches the name, or
// — when it contains digits — the phone number. Phones are stored as the
// WhatsApp wa_id (201014443991), and the local form people type (01014443991)
// is a substring of it, so `contains` on the normalized digits finds both.

/** The query as phone digits, or null when it isn't a number. */
export function phoneDigits(query: string): string | null {
  const digits = normalizePhone(query);
  return /^\d+$/.test(digits) ? digits : null;
}

/** Name-or-phone condition — fits any model with `fullName` + `phone` (Profile, Doctor). */
export type PersonSearch = {
  OR: ({ fullName: { contains: string; mode: "insensitive" } } | { phone: { contains: string } })[];
};

/** Filter for a search box, or undefined when the query is blank. */
export function personSearch(query: string | undefined): PersonSearch | undefined {
  const q = query?.trim();
  if (!q) return undefined;
  const phone = phoneDigits(q);
  return {
    OR: [
      { fullName: { contains: q, mode: "insensitive" } },
      ...(phone ? [{ phone: { contains: phone } }] : []),
    ],
  };
}

/** The same search as a raw-SQL condition on a profiles alias (`p`). TRUE when blank. */
export function personSearchSql(query: string | undefined, alias = "p"): Prisma.Sql {
  const q = query?.trim();
  if (!q) return Prisma.sql`TRUE`;
  const a = Prisma.raw(alias);
  const like = `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
  const phone = phoneDigits(q);
  return phone
    ? Prisma.sql`(${a}."fullName" ILIKE ${like} OR ${a}.phone LIKE ${`%${phone}%`})`
    : Prisma.sql`${a}."fullName" ILIKE ${like}`;
}
