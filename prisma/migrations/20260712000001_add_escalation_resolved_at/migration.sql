-- AlterTable
ALTER TABLE "escalations" ADD COLUMN "resolvedAt" TIMESTAMP(3);

-- Enable realtime so the admin dashboard can subscribe to new/resolved escalations
ALTER PUBLICATION supabase_realtime ADD TABLE "escalations";
