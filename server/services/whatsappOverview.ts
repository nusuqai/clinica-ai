import "server-only";
import { prisma } from "@/lib/prisma";
import type { WhatsappConfigStatus } from "@/lib/meta/whatsapp-config";

/**
 * Every clinic's WhatsApp connection state in one query, for the platform
 * console's WhatsApp page — the same shape `getPlatformAiOverview` uses for AI
 * credit, since `WhatsappConfig` is the same kind of 1:1 satellite table.
 *
 * Deliberately never selects `accessTokenCipher`: the webhook and verify tokens
 * are meant to be read off the screen and pasted into Meta, but the access token
 * is decrypted only in lib/meta/whatsapp-config.ts and never travels to a client.
 */

export interface PlatformClinicWhatsapp {
  clinicId: string;
  name: string;
  slug: string;
  /** Non-secret connection status, or null when this clinic isn't connected. */
  config: WhatsappConfigStatus | null;
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
      whatsappConfig: {
        select: {
          phoneNumberId: true,
          wabaId: true,
          accessTokenCipher: true,
          webhookToken: true,
          verifyToken: true,
          updatedAt: true,
        },
      },
    },
    orderBy: { name: "asc" },
  });

  const rows: PlatformClinicWhatsapp[] = clinics.map((c) => ({
    clinicId: c.id,
    name: c.name,
    slug: c.slug,
    config: c.whatsappConfig
      ? {
          phoneNumberId: c.whatsappConfig.phoneNumberId,
          wabaId: c.whatsappConfig.wabaId,
          // Presence only — the cipher itself stops here.
          hasToken: c.whatsappConfig.accessTokenCipher.length > 0,
          webhookToken: c.whatsappConfig.webhookToken,
          verifyToken: c.whatsappConfig.verifyToken,
          updatedAt: c.whatsappConfig.updatedAt,
        }
      : null,
  }));

  return {
    clinics: rows,
    configuredCount: rows.filter((r) => r.config !== null).length,
  };
}
