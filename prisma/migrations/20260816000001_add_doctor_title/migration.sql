-- Add a professional rank to doctors: أخصائي (SPECIALIST) or استشاري (CONSULTANT),
-- plus free-text academic qualifications (المؤهلات العلمية) and sub-specialty
-- areas (مجالات الخبرة الدقيقة). All nullable so existing doctors stay valid.

-- CreateEnum
CREATE TYPE "DoctorTitle" AS ENUM ('SPECIALIST', 'CONSULTANT');

-- AlterTable
ALTER TABLE "doctors" ADD COLUMN "title" "DoctorTitle",
ADD COLUMN "qualifications" TEXT,
ADD COLUMN "expertiseAreas" TEXT;
