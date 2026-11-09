-- Wie bei Supabase: Tabellenrechte für die App-Rollen, geschützt durch Row Level Security
grant select, insert, update, delete on all tables in schema public to anon, authenticated;
