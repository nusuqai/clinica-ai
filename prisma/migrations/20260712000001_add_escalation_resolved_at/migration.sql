-- AlterTable
ALTER TABLE "escalations" ADD COLUMN "resolvedAt" TIMESTAMP(3);

-- Enable realtime so the admin dashboard can subscribe to new/resolved escalations
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'escalations'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public."escalations";
  END IF;
END
$$;