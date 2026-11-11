-- =====================================================================
-- Päckli – „Zuletzt gesucht“ pro Person (statt pro Gerät)
-- Einmal im Supabase SQL Editor ausführen.
--
-- Eigene Tabelle, die nur die Person selbst lesen und ändern kann
-- (auch Mitbearbeiter derselben Liste sehen sie nicht). Höchstens 3 Begriffe.
-- =====================================================================
create table if not exists public.recent_searches (
  user_id    uuid primary key references public.profiles(id) on delete cascade default auth.uid(),
  terms      text[] not null default '{}'
             check (cardinality(terms) <= 3 and coalesce(length(array_to_string(terms, '')), 0) <= 300),
  updated_at timestamptz not null default now()
);
alter table public.recent_searches enable row level security;

create policy "own searches read"   on public.recent_searches for select using (user_id = auth.uid());
create policy "own searches insert" on public.recent_searches for insert with check (user_id = auth.uid());
create policy "own searches update" on public.recent_searches for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own searches delete" on public.recent_searches for delete using (user_id = auth.uid());

revoke all on public.recent_searches from anon;
grant select, insert, update, delete on public.recent_searches to authenticated;
