-- Links made before record access was granted on creation were saved with
-- canViewRecords = false. A relative with no phone of their own can only have
-- been created by the guardian who added them, so those links get the access
-- new ones are created with. Relatives with a phone may have an account of
-- their own and are left unchanged.
UPDATE "patient_connections" pc
SET "canViewRecords" = true, "updatedAt" = NOW()
FROM "profiles" p
WHERE p."id" = pc."dependentId"
  AND p."phone" IS NULL
  AND pc."canViewRecords" = false;
