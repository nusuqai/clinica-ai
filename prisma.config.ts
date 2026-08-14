import "dotenv/config";
import { defineConfig, env } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",

  datasource: {
    url: env("DATABASE_URL"),
  },

  // externalTables is still an unstable feature, so it must be opted into
  experimental: {
    externalTables: true,
  },

  // Everything GoTrue owns. Prisma Migrate will neither generate DDL for these
  // nor count them as drift. Taken from the drift report — if a Supabase
  // upgrade adds a new auth table, add it here too.
  tables: {
    external: [
      "auth.audit_log_entries",
      "auth.custom_oauth_providers",
      "auth.flow_state",
      "auth.identities",
      "auth.instances",
      "auth.mfa_amr_claims",
      "auth.mfa_challenges",
      "auth.mfa_factors",
      "auth.oauth_authorizations",
      "auth.oauth_client_states",
      "auth.oauth_clients",
      "auth.oauth_consents",
      "auth.one_time_tokens",
      "auth.refresh_tokens",
      "auth.saml_providers",
      "auth.saml_relay_states",
      "auth.schema_migrations",
      "auth.sessions",
      "auth.sso_domains",
      "auth.sso_providers",
      "auth.users",
      "auth.webauthn_challenges",
      "auth.webauthn_credentials",
    ],
  },

  enums: {
    external: [
      "auth.aal_level",
      "auth.code_challenge_method",
      "auth.factor_status",
      "auth.factor_type",
      "auth.oauth_authorization_status",
      "auth.oauth_client_type",
      "auth.oauth_registration_type",
      "auth.oauth_response_type",
      "auth.one_time_token_type",
    ],
  },

  migrations: {
    path: "prisma/migrations",

    // Runs against the shadow database before migrations replay. This is what
    // stops the P3006 errors: the shadow DB is blank Postgres, so the objects
    // Supabase would normally provide have to be stubbed here.
   initShadowDb: `
      CREATE SCHEMA IF NOT EXISTS auth;

      CREATE TABLE IF NOT EXISTS auth.users (
        id                 uuid PRIMARY KEY,
        email              varchar(255),
        phone              text,
        raw_user_meta_data jsonb,
        raw_app_meta_data  jsonb,
        created_at         timestamptz,
        updated_at         timestamptz
      );

      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
          CREATE PUBLICATION supabase_realtime;
        END IF;
      END
      $$;
    `,
  },
});
