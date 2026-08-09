// The clinic that all pre-existing (single-tenant) data was backfilled into by
// the multi-tenancy migration. Used for product-level surfaces that are not yet
// per-clinic: the marketing landing page, guest chat, and the WhatsApp webhook
// (multi-clinic WhatsApp routing lands with issues #4/#7).
export const DEFAULT_CLINIC_ID = "00000000-0000-0000-0000-000000000001";
export const DEFAULT_CLINIC_SLUG = "demo";
