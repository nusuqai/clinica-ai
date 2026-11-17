import "server-only";
import { prisma } from "@/lib/prisma";
import {
  WHATSAPP_NUMBER_ORDER,
  WHATSAPP_STATUS_SELECT,
  toStatus,
  type WhatsappConfigStatus,
} from "@/lib/meta/whatsapp-config";

/**
 * Every clinic's WhatsApp numbers in one query, for the platform console's
 * WhatsApp page.
 *
 * Deliberately never selects `accessTokenCipher`: the webhook and verify tokens
 * are meant to be read off the screen and pasted into Meta, but the access token
 * is decrypted only in lib/meta/whatsapp-config.ts and never travels to a client.
 */

export interface PlatformClinicWhatsapp {
  clinicId: string;
  name: string;
  slug: string;
  /** Non-secret status of each of the clinic's numbers, main number first. */
  numbers: WhatsappConfigStatus[];
  /** The clinic's branches — possible owners of a number. */
  branches: { id: string; name: string }[];
}

export interface PlatformWhatsappOverview {
  clinics: PlatformClinicWhatsapp[];
  configuredCount: number;
}

export async function getPlatformWhatsappOverview(): Promise<PlatformWhatsappOverview> {
  const clinics = await prisma.clinic.findMany({
    where: { isActive: true },
    select: {
      id: true,
      name: true,
      slug: true,
      whatsappConfigs: { select: WHATSAPP_STATUS_SELECT, orderBy: WHATSAPP_NUMBER_ORDER },
      branches: { select: { id: true, name: true }, orderBy: { name: "asc" } },
    },
    orderBy: { name: "asc" },
  });

  const rows: PlatformClinicWhatsapp[] = clinics.map((c) => ({
    clinicId: c.id,
    name: c.name,
    slug: c.slug,
    // toStatus keeps only the cipher's presence — the cipher itself stops here.
    numbers: c.whatsappConfigs.map(toStatus),
    branches: c.branches,
  }));

  return {
    clinics: rows,
    configuredCount: rows.filter((r) => r.numbers.length > 0).length,
  };
}
