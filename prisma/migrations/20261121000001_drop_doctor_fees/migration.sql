-- Services, packages & offers — step 11 (docs/services-and-packages.md §9).
--
-- Every price now lives on services: the old per-doctor fees were turned into
-- كشف / استشارة services with the doctor's price on DoctorService by
-- 20261120000001_services_packages, and every reader moved to services. The
-- columns go now.

ALTER TABLE "doctors" DROP COLUMN "examinationFee",
DROP COLUMN "consultationFee";
