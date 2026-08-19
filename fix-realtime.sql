-- messages
create policy "allow_realtime_select"
on messages
for select
using (true);

alter publication supabase_realtime add table messages;

GRANT SELECT ON messages TO anon, authenticated;

-- conversations
alter publication supabase_realtime add table conversations;

GRANT SELECT ON conversations TO anon, authenticated;

-- only if conversations has RLS enabled (check first):
create policy "allow_realtime_select"
on conversations
for select
using (true);


-- select relrowsecurity from pg_class where relname = 'messages';
-- select policyname, cmd, qual from pg_policies where tablename = 'messages';
-- create policy "allow_realtime_select"
-- on messages
-- for select
-- using (true);
-- select * from pg_publication_tables where pubname = 'supabase_realtime';
-- alter publication supabase_realtime add table messages;

-- select column_name 
-- from information_schema.columns 
-- where table_name = 'messages';

-- GRANT SELECT ON messages TO anon, authenticated;

-- select grantee, privilege_type 
-- from information_schema.role_table_grants 
-- where table_name = 'messages';

-- GRANT SELECT ON conversations TO anon, authenticated;
-- select relrowsecurity from pg_class where relname = 'conversations';
-- select policyname, cmd, qual from pg_policies where tablename = 'conversations';