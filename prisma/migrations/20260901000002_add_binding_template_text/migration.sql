-- Snapshot of the template's text (header / body / footer with {{n}} placeholders)
-- onto the binding, so the automation sender can render the exact message locally
-- for the admin inbox thread without a per-send Graph API call to Meta.

-- AlterTable
ALTER TABLE "clinic_appointment_templates" ADD COLUMN     "bodyText" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "headerText" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "footerText" TEXT NOT NULL DEFAULT '';
