-- =====================================================================
-- Päckli – Sicherheit: Bremsklotz gegen Missbrauch der Gast-Funktionen
-- Einmal im Supabase SQL Editor ausführen.
--
--  * Reservieren: höchstens 10 Reservierungen pro Liste und Minute
--  * Aufheben mit Code: höchstens 20 Fehlversuche pro Absender in 10 Minuten
--  * Eigene Reservierungen abfragen: höchstens 30 Abfragen pro Absender und Minute
-- =====================================================================

create table if not exists public.rate_events (
  bucket text not null,
  at     timestamptz not null default now()
);
create index if not exists rate_events_bucket_at on public.rate_events (bucket, at);
alter table public.rate_events enable row level security;   -- kein Zugriff aus der App

-- Absender: IP-Adresse aus der Anfrage (von Supabase weitergereicht), sonst ein gemeinsamer Topf
create or replace function public.client_ip() returns text
language sql stable as $$
  select coalesce(
    nullif(split_part(coalesce(current_setting('request.headers', true)::json ->> 'x-forwarded-for', ''), ',', 1), ''),
    'unbekannt')
$$;

-- Zählt ein Ereignis und meldet, ob das Limit im Zeitfenster überschritten ist
create or replace function public.rate_limited(p_bucket text, p_max int, p_window interval) returns boolean
language plpgsql security definer set search_path = public as $$
declare v_count int;
begin
  -- gelegentlich alte Einträge wegräumen
  if random() < 0.02 then delete from rate_events where at < now() - interval '1 day'; end if;
  select count(*) into v_count from rate_events where bucket = p_bucket and at > now() - p_window;
  if v_count >= p_max then return true; end if;
  insert into rate_events (bucket) values (p_bucket);
  return false;
end $$;

create or replace function public.reserve_wish(p_token text, p_wish uuid, p_quantity int, p_name text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_list  uuid;
  v_date  date;
  v_qty   int;
  v_taken int;
  v_code  text;
  v_name  text := left(trim(coalesce(p_name, '')), 60);
begin
  if v_name = '' then return jsonb_build_object('ok', false, 'error', 'name_required'); end if;
  if p_quantity is null or p_quantity < 1 or p_quantity > 20 then
    return jsonb_build_object('ok', false, 'error', 'invalid_quantity');
  end if;

  select id, event_date into v_list, v_date from lists where guest_token = p_token and archived_at is null;
  if v_list is null then return jsonb_build_object('ok', false, 'error', 'link_invalid'); end if;
  -- Bremsklotz: höchstens 10 Reservierungen pro Liste und Minute
  if rate_limited('reserve:' || v_list, 10, interval '1 minute') then
    return jsonb_build_object('ok', false, 'error', 'rate_limited');
  end if;

  select quantity into v_qty from wishes where id = p_wish and list_id = v_list for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'wish_not_found'); end if;

  select coalesce(sum(quantity), 0) into v_taken from reservations where wish_id = p_wish;
  if v_taken + p_quantity > v_qty then
    return jsonb_build_object('ok', false, 'error', 'already_taken', 'available', greatest(v_qty - v_taken, 0));
  end if;

  v_code := gen_code();
  insert into reservations (wish_id, quantity, guest_name, code_hash, forget_after)
  values (p_wish, p_quantity, v_name, hash_code(v_code), coalesce(v_date, current_date) + 60);
  return jsonb_build_object('ok', true, 'code', v_code);   -- bleibt nur auf dem Gerät des Gastes
end $$;

create or replace function public.cancel_reservation(p_code text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_bucket text := 'cancel_fail:' || client_ip();
begin
  if (select count(*) from rate_events where bucket = v_bucket and at > now() - interval '10 minutes') >= 20 then
    return jsonb_build_object('ok', false, 'error', 'rate_limited');
  end if;
  delete from reservations where code_hash = hash_code(p_code);
  if not found then
    insert into rate_events (bucket) values (v_bucket);   -- nur Fehlversuche zählen
    return jsonb_build_object('ok', false);
  end if;
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.my_reservations(p_codes text[])
returns table (code text, wish_id uuid, quantity int)
language plpgsql security definer set search_path = public as $$
begin
  if rate_limited('mine:' || client_ip(), 30, interval '1 minute') then return; end if;
  return query
    select c, r.wish_id, r.quantity
    from unnest(p_codes[1:50]) as c
    join reservations r on r.code_hash = hash_code(c);
end $$;

revoke execute on function public.rate_limited(text, int, interval), public.client_ip() from public, anon, authenticated;
grant execute on function public.reserve_wish(text, uuid, int, text), public.cancel_reservation(text), public.my_reservations(text[]) to anon, authenticated;
