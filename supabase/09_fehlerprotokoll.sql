-- =====================================================================
-- Päckli – Anonymes Fehlerprotokoll
-- Einmal im Supabase SQL Editor ausführen.
--
-- Die App meldet unerwartete Fehler hierher, ohne Namen oder E-Mail-Adressen.
-- Lesen lässt sich die Tabelle nur im Supabase-Dashboard (Table Editor → client_errors).
-- Einträge werden nach 30 Tagen automatisch gelöscht.
-- =====================================================================
create table if not exists public.client_errors (
  id      bigint generated always as identity primary key,
  at      timestamptz not null default now(),
  message text not null,
  stack   text,
  page    text,
  agent   text,
  signed_in boolean not null default false
);
alter table public.client_errors enable row level security;   -- kein Lesen aus der App

create or replace function public.log_client_error(p_message text, p_stack text default null, p_page text default null, p_agent text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  -- höchstens 20 Meldungen pro Absender in 10 Minuten, gegen Überflutung
  if rate_limited('err:' || client_ip(), 20, interval '10 minutes') then return; end if;
  if random() < 0.02 then delete from client_errors where at < now() - interval '30 days'; end if;
  insert into client_errors (message, stack, page, agent, signed_in)
  values (left(coalesce(p_message, '?'), 500), left(p_stack, 2000), left(p_page, 200), left(p_agent, 200), auth.uid() is not null);
end $$;

revoke execute on function public.log_client_error(text, text, text, text) from public;
grant execute on function public.log_client_error(text, text, text, text) to anon, authenticated;
