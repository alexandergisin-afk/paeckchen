-- Wie bei Supabase: Tabellenrechte für die App-Rollen, geschützt durch Row Level Security
grant select, insert, update, delete on all tables in schema public to anon, authenticated;
grant select, insert, update, delete on all tables in schema public to service_role;
revoke all on public.audit_log from anon;
revoke insert, update, delete on public.audit_log from anon, authenticated;  -- wie in Supabase: Migration nach den Standardrechten
revoke all on public.list_followers from anon;
revoke insert, update on public.list_followers from authenticated;
