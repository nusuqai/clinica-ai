import "server-only";
import { prisma } from "@/lib/prisma";
import { ok, err, type Result } from "./_result";
import {
  type Clinic,
  type ClinicPhone,
  type ClinicSocial,
  type PhoneType,
  type SocialPlatform,
} from "@prisma/client";

// ─── Types ────────────────────────────────────────────────────────────────────

export type ClinicInfo = Clinic & {
  phones: ClinicPhone[];
  socials: ClinicSocial[];
};

export interface ClinicPhoneInput {
  type: PhoneType;
  number: string;
  label?: string | null;
  isPrimary?: boolean;
}

export interface ClinicSocialInput {
  platform: SocialPlatform;
  url: string;
}

export interface UpdateClinicInfoInput {
  clinicId: string;
  name?: string;
  description?: string | null;
  phones?: ClinicPhoneInput[];
  socials?: ClinicSocialInput[];
}

// ─── Queries ──────────────────────────────────────────────────────────────────

export async function getClinicInfo(clinicId: string): Promise<ClinicInfo | null> {
  return prisma.clinic.findUnique({
    where: { id: clinicId },
    include: {
      phones: { orderBy: [{ isPrimary: "desc" }, { number: "asc" }] },
      socials: { orderBy: { platform: "asc" } },
    },
  });
}

// ─── Mutations ──────────────────────────────────────────────────────────────

export async function updateClinicInfo(
  input: UpdateClinicInfoInput,
): Promise<Result<void>> {
  try {
    await prisma.$transaction(async (tx) => {
      await tx.clinic.update({
        where: { id: input.clinicId },
        data: {
          ...(input.name !== undefined && { name: input.name.trim() }),
          ...(input.description !== undefined && {
            description: input.description?.trim() || null,
          }),
        },
      });
      if (input.phones !== undefined) {
        await tx.clinicPhone.deleteMany({ where: { clinicId: input.clinicId } });
        const rows = input.phones
          .filter((p) => p.number.trim())
          .map((p) => ({
            clinicId: input.clinicId,
            type: p.type,
            number: p.number.trim(),
            label: p.label?.trim() || null,
            isPrimary: p.isPrimary ?? false,
          }));
        if (rows.length) await tx.clinicPhone.createMany({ data: rows });
      }
      if (input.socials !== undefined) {
        await tx.clinicSocial.deleteMany({ where: { clinicId: input.clinicId } });
        const rows = input.socials
          .filter((s) => s.url.trim())
          .map((s) => ({
            clinicId: input.clinicId,
            platform: s.platform,
            url: s.url.trim(),
          }));
        if (rows.length) await tx.clinicSocial.createMany({ data: rows });
      }
    });
    return ok(undefined);
  } catch (e) {
    return err(e instanceof Error ? e.message : "فشل تحديث معلومات العيادة");
  }
}
