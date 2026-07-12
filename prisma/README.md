# Working with Prisma migrations in this project

## The normal flow

For most schema changes, this is all you need:

1. Edit `prisma/schema.prisma`.
2. Run `npm run prisma:migrate` (or `prisma:migrate:local` against the local Supabase stack).
   This generates a new folder under `prisma/migrations/`, applies it to the dev database,
   and regenerates the Prisma client.
3. Commit the new migration folder.
4. Deploy applies it automatically via `npm run prisma:deploy` (`prisma migrate deploy`),
   which just runs pending migration files against the target database in order.

## When `prisma migrate dev` fails with a shadow database error

Example:

```text
Migration `20260705000001_add_session_ai_toggle_and_escalations` failed to apply
cleanly to the shadow database.
Error code: P1014
Error: The underlying table for model `chat_sessions` does not exist.
```

**Why this happens:** `prisma migrate dev` doesn't just run your new migration — it spins up
a throwaway "shadow" database and replays *every* migration file in `prisma/migrations/`
against it from scratch, purely to validate the migration history and compute the diff for
the next migration. If any *earlier* migration doesn't reproduce cleanly on a truly empty
database — e.g. because something in this project's history was created outside of a
tracked migration file (a manual change via the Supabase dashboard/SQL editor, a
Supabase-managed trigger/policy, etc.) — the shadow replay breaks, even though the real
dev database is completely fine and already has all the tables it needs.

**This is a local dev-tooling limitation only.** `prisma migrate deploy` (used for
CI/production, see `npm run prisma:deploy`) never creates a shadow database — it just
applies whatever's listed as pending in the `_prisma_migrations` table straight to the
target database, in order. So a shadow DB failure here has no bearing on whether the
migration is safe to ship.

### The workaround

**Always run this against the local Supabase stack (`.env.localdb`) first. Never run it
against `.env.hosted` until the change has been fully tested locally.** The hosted database
is real data — the local stack (`npm run supabase:start`) is the disposable one to break
things against.

1. Write the migration SQL by hand in a new `prisma/migrations/<timestamp>_<name>/migration.sql`
   file (match the naming convention of existing migration folders), based on the schema change
   you made in `schema.prisma`. Since `migrate dev` can't run to generate this for you, write
   the SQL yourself, mirroring the style of previous migration files in this folder.

2. Apply that SQL directly to the **local** database (bypasses the shadow DB entirely):

   ```bash
   npx dotenv -e .env.localdb -- prisma db execute --schema prisma/schema.prisma --file prisma/migrations/<timestamp>_<name>/migration.sql
   ```

3. Tell Prisma's **local** migration history that this migration is now applied, so
   `migrate dev`/`migrate deploy` won't try to run it again:

   ```bash
   npx dotenv -e .env.localdb -- prisma migrate resolve --applied <timestamp>_<name>
   ```

4. Regenerate the Prisma client so the TypeScript types pick up the schema change:

   ```bash
   npm run prisma:generate:local
   ```

5. Test the change end-to-end against the local database.

6. Only once fully verified locally: commit the migration folder, then repeat steps 2–4
   with `.env.hosted` (`prisma:generate` instead of `prisma:generate:local`) to bring the
   hosted dev database in sync. Deploying to production still goes through the normal
   `npm run prisma:deploy` (`prisma migrate deploy`) — since that command doesn't use a
   shadow database, it will apply the migration cleanly even though `migrate dev` couldn't
   validate it locally.

### Note

`prisma db execute` runs raw SQL — it does not touch Prisma's migration history table.
`prisma migrate resolve --applied` only updates the bookkeeping table — it does not run any
SQL. Running both is what keeps the actual schema and Prisma's tracked history in sync
without needing a working shadow database replay.
