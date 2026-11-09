-- =====================================================================
-- Päckli – Eltern besorgen, Eltern reservieren, Benachrichtigungen
-- Einmal im Supabase SQL Editor ausführen.
-- =====================================================================

-- Reservierung: „Bitte besorgt ihr es“ und wer (aus der Familie) sie eingetragen hat
alter table public.reservations add column if not exists parents_buy boolean not null default false;
alter table public.reservations add column if not exists entered_by uuid references public.profiles(id) on delete set null;

-- Benachrichtigungen bei neuen Reservierungen: sofort, täglich (Standard) oder aus
alter table public.profiles add column if not exists notify_reservations text not null default 'daily'
  check (notify_reservations in ('instant', 'daily', 'off'));

-- Bis wann wurde zuletzt benachrichtigt (je Art)
create table if not exists public.notify_state (
  mode    text primary key check (mode in ('instant', 'daily')),
  last_at timestamptz not null
);
alter table public.notify_state enable row level security;   -- kein Zugriff aus der App

-- ---------------------------------------------------------------------
-- Gemeinsamer Kern fürs Reservieren (Gäste und Eltern):
-- Zeilensperre auf dem Wunsch, damit gleichzeitige Klicks nacheinander laufen.
-- Nicht direkt aufrufbar, nur über reserve_wish und reserve_for_guest.
-- ---------------------------------------------------------------------
create or replace function public.reserve_core(p_list uuid, p_event date, p_wish uuid, p_quantity int, p_name text,
                                               p_parents_buy boolean, p_entered_by uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_qty   int;
  v_taken int;
  v_code  text;
  v_name  text := left(trim(coalesce(p_name, '')), 60);
begin
  if v_name = '' then return jsonb_build_object('ok', false, 'error', 'name_required'); end if;
  if p_quantity is null or p_quantity < 1 or p_quantity > 20 then
    return jsonb_build_object('ok', false, 'error', 'invalid_quantity');
  end if;
  select quantity into v_qty from wishes where id = p_wish and list_id = p_list for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'wish_not_found'); end if;
  select coalesce(sum(quantity), 0) into v_taken from reservations where wish_id = p_wish;
  if v_taken + p_quantity > v_qty then
    return jsonb_build_object('ok', false, 'error', 'already_taken', 'available', greatest(v_qty - v_taken, 0));
  end if;
  v_code := gen_code();
  insert into reservations (wish_id, quantity, guest_name, code_hash, forget_after, parents_buy, entered_by)
  values (p_wish, p_quantity, v_name, hash_code(v_code), coalesce(p_event, current_date) + 60, coalesce(p_parents_buy, false), p_entered_by);
  return jsonb_build_object('ok', true, 'code', v_code);
end $$;

-- Gäste: mit Link, Bremsklotz, optional „Bitte besorgt ihr es“
drop function if exists public.reserve_wish(text, uuid, int, text);
create or replace function public.reserve_wish(p_token text, p_wish uuid, p_quantity int, p_name text, p_parents_buy boolean default false)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_list uuid; v_date date;
begin
  select id, event_date into v_list, v_date from lists where guest_token = p_token and archived_at is null;
  if v_list is null then return jsonb_build_object('ok', false, 'error', 'link_invalid'); end if;
  if rate_limited('reserve:' || v_list, 10, interval '1 minute') then
    return jsonb_build_object('ok', false, 'error', 'rate_limited');
  end if;
  return reserve_core(v_list, v_date, p_wish, p_quantity, p_name, p_parents_buy, null);
end $$;

-- Eltern: für jemanden reservieren (z. B. Oma hat angerufen)
create or replace function public.reserve_for_guest(p_wish uuid, p_quantity int, p_name text, p_parents_buy boolean default false)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_list uuid; v_date date;
begin
  select w.list_id, l.event_date into v_list, v_date from wishes w join lists l on l.id = w.list_id where w.id = p_wish;
  if v_list is null or my_role(v_list) is null then raise exception 'forbidden' using errcode = '42501'; end if;
  return reserve_core(v_list, v_date, p_wish, p_quantity, p_name, p_parents_buy, auth.uid());
end $$;

-- ---------------------------------------------------------------------
-- Benachrichtigungen (nur für den Server): neue Reservierungen seit dem letzten Lauf
-- je Empfänger. Ausgenommen: eigene Einträge und Listen mit ausgeblendeten Reservierungen.
-- ---------------------------------------------------------------------
create or replace function public.notify_window(p_mode text) returns timestamptz
language sql stable security definer set search_path = public as $$
  select coalesce((select last_at from notify_state where mode = p_mode), now() - interval '1 day')
$$;

create or replace function public.reservation_notices(p_mode text, p_since timestamptz, p_until timestamptz)
returns table (email text, list_id uuid, list_title text, items jsonb)
language sql stable security definer set search_path = public as $$
  select u.email::text, l.id, l.title,
         jsonb_agg(jsonb_build_object('wish', w.title, 'name', r.guest_name, 'quantity', r.quantity,
                                      'parents_buy', r.parents_buy, 'entered_by_family', r.entered_by is not null)
                   order by r.created_at)
  from reservations r
  join wishes w on w.id = r.wish_id
  join lists l on l.id = w.list_id
  join list_members m on m.list_id = l.id and m.show_reservations
  join profiles p on p.id = m.user_id and p.notify_reservations = p_mode
  join auth.users u on u.id = m.user_id
  where r.created_at > p_since and r.created_at <= p_until
    and r.entered_by is distinct from m.user_id
    and u.email is not null
  group by u.email, l.id, l.title
$$;

create or replace function public.set_notify_window(p_mode text, p_until timestamptz) returns void
language sql security definer set search_path = public as $$
  insert into notify_state (mode, last_at) values (p_mode, p_until)
  on conflict (mode) do update set last_at = excluded.last_at
$$;

revoke execute on function public.reserve_core(uuid, date, uuid, int, text, boolean, uuid),
  public.notify_window(text), public.reservation_notices(text, timestamptz, timestamptz), public.set_notify_window(text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.notify_window(text), public.reservation_notices(text, timestamptz, timestamptz),
  public.set_notify_window(text, timestamptz) to service_role;
grant execute on function public.reserve_wish(text, uuid, int, text, boolean) to anon, authenticated;
grant execute on function public.reserve_for_guest(uuid, int, text, boolean) to authenticated;
