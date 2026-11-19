-- =====================================================================
-- Päckli – Komfort für Konten zum Schenken
-- Im Supabase SQL Editor ausführen. Kann gefahrlos mehrfach ausgeführt werden.
--
-- * Wunschlisten am Konto speichern (list_followers): automatisch beim Öffnen des Gast-Links,
--   oder Eltern fügen ein Konto hinzu. Das ist KEINE Mitgliedschaft: Schenkende sehen weiterhin
--   nur die Gästeansicht (keine Namen anderer, kein Bearbeiten, kein Verlauf).
-- * Reservierungen, die angemeldet gemacht werden, gehören dem Konto (Aufheben ohne Code).
-- * Bisherige Reservierungs-Codes eines Geräts lassen sich dem Konto zuordnen.
-- =====================================================================

create table if not exists public.list_followers (
  list_id    uuid not null references public.lists on delete cascade,
  user_id    uuid not null references public.profiles on delete cascade,
  source     text not null default 'link' check (source in ('link', 'family')),
  added_by   uuid references public.profiles on delete set null,
  created_at timestamptz not null default now(),
  primary key (list_id, user_id)
);
create index if not exists list_followers_user on public.list_followers (user_id);
alter table public.list_followers enable row level security;
drop policy if exists "followers read" on public.list_followers;
create policy "followers read" on public.list_followers for select to authenticated
  using (user_id = auth.uid() or my_role(list_id) is not null);
drop policy if exists "followers remove" on public.list_followers;
create policy "followers remove" on public.list_followers for delete to authenticated
  using (user_id = auth.uid() or my_role(list_id) is not null);
revoke all on public.list_followers from anon;
revoke insert, update on public.list_followers from authenticated;

alter table public.reservations add column if not exists reserved_by uuid references public.profiles on delete set null;
create index if not exists reservations_reserved_by on public.reservations (reserved_by) where reserved_by is not null;

-- Wer angemeldet als Gast reserviert: Reservierung gehört dem Konto, Liste wird gespeichert
create or replace function public.reservation_owner() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_list uuid;
begin
  if new.entered_by is null and new.reserved_by is null and auth.uid() is not null then
    new.reserved_by := auth.uid();
    select list_id into v_list from wishes where id = new.wish_id;
    if my_role(v_list) is null then
      insert into list_followers (list_id, user_id, source) values (v_list, auth.uid(), 'link') on conflict do nothing;
    end if;
  end if;
  return new;
end $$;
drop trigger if exists reservation_owner on public.reservations;
create trigger reservation_owner before insert on public.reservations for each row execute function public.reservation_owner();

-- Liste über den Gast-Link speichern (angemeldet). Mitglieder brauchen das nicht.
create or replace function public.follow_list(p_token text) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_list uuid;
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  select id into v_list from lists where guest_token = p_token and archived_at is null;
  if v_list is null or my_role(v_list) is not null then return v_list; end if;
  insert into list_followers (list_id, user_id, source) values (v_list, auth.uid(), 'link') on conflict do nothing;
  return v_list;
end $$;

-- Eltern fügen ein Konto hinzu (per E-Mail). Gibt es noch kein Konto: 'no_account'.
create or replace function public.add_follower(p_list uuid, p_email text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_user uuid; v_name text;
begin
  if my_role(p_list) is null then raise exception 'forbidden' using errcode = '42501'; end if;
  select u.id, p.display_name into v_user, v_name from auth.users u join profiles p on p.id = u.id where lower(u.email) = lower(trim(p_email));
  if v_user is null then return jsonb_build_object('status', 'no_account'); end if;
  if exists (select 1 from list_members where list_id = p_list and user_id = v_user) then
    return jsonb_build_object('status', 'member', 'name', v_name);
  end if;
  insert into list_followers (list_id, user_id, source, added_by) values (p_list, v_user, 'family', auth.uid())
  on conflict (list_id, user_id) do update set source = 'family', added_by = excluded.added_by;
  return jsonb_build_object('status', 'added', 'name', v_name);
end $$;

-- Für Mitglieder: Schenkende mit Konto, die die Liste gespeichert haben
create or replace function public.list_followers_of(p_list uuid)
returns table (user_id uuid, display_name text, source text, created_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if my_role(p_list) is null then raise exception 'forbidden' using errcode = '42501'; end if;
  return query select f.user_id, p.display_name, f.source, f.created_at
    from list_followers f join profiles p on p.id = f.user_id where f.list_id = p_list order by p.display_name;
end $$;

-- Für Schenkende: die eigenen gespeicherten Wunschlisten (mit Gast-Link zum Öffnen)
create or replace function public.my_followed_lists()
returns table (list_id uuid, title text, recipient_name text, event_date date, cover int, guest_token text)
language sql stable security definer set search_path = public as $$
  select l.id, l.title, l.recipient_name, l.event_date, l.cover, l.guest_token
  from list_followers f join lists l on l.id = f.list_id
  where f.user_id = auth.uid() and l.archived_at is null
  order by l.event_date nulls last, l.title
$$;

-- Für Schenkende: eigene Reservierungen am Konto (für eine Liste über den Gast-Link)
create or replace function public.my_account_reservations(p_token text)
returns table (id uuid, wish_id uuid, quantity int, amount_cents int)
language sql stable security definer set search_path = public as $$
  select r.id, r.wish_id, r.quantity, r.amount_cents
  from reservations r join wishes w on w.id = r.wish_id join lists l on l.id = w.list_id
  where r.reserved_by = auth.uid() and auth.uid() is not null and l.guest_token = p_token
$$;

-- Eigene Reservierung am Konto aufheben (ohne Code)
create or replace function public.cancel_my_reservation(p_id uuid) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  delete from reservations where id = p_id and reserved_by = auth.uid();
  return found;
end $$;

-- Reservierungen dieses Geräts (Codes) dem Konto zuordnen
create or replace function public.claim_reservations(p_codes text[]) returns int
language plpgsql security definer set search_path = public, extensions as $$
declare v_n int;
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  update reservations set reserved_by = auth.uid()
  where reserved_by is null and entered_by is null
    and code_hash = any (select hash_code(c) from unnest(coalesce(p_codes[1:50], '{}')) c);
  get diagnostics v_n = row_count;
  -- die zugehörigen Listen speichern
  insert into list_followers (list_id, user_id, source)
    select distinct w.list_id, auth.uid(), 'link' from reservations r join wishes w on w.id = r.wish_id
    where r.reserved_by = auth.uid() and my_role(w.list_id) is null
  on conflict do nothing;
  return v_n;
end $$;

-- Verlauf: Speichern und Entfernen
create or replace function public.audit_followers() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    perform audit_write(new.list_id, 'member', case when new.source = 'family' then 'follower_added' else 'follower_saved' end, new.user_id,
      jsonb_build_object('member', (select display_name from profiles where id = new.user_id)));
  elsif exists (select 1 from lists where id = old.list_id) then
    perform audit_write(old.list_id, 'member', case when auth.uid() = old.user_id then 'follower_left' else 'follower_removed' end, old.user_id,
      jsonb_build_object('member', (select display_name from profiles where id = old.user_id)));
  end if;
  return null;
end $$;
drop trigger if exists audit_followers on public.list_followers;
create trigger audit_followers after insert or delete on public.list_followers for each row execute function public.audit_followers();

revoke execute on function public.follow_list(text), public.add_follower(uuid, text), public.list_followers_of(uuid),
  public.my_followed_lists(), public.my_account_reservations(text), public.cancel_my_reservation(uuid), public.claim_reservations(text[])
  from public, anon;
grant execute on function public.follow_list(text), public.add_follower(uuid, text), public.list_followers_of(uuid),
  public.my_followed_lists(), public.my_account_reservations(text), public.cancel_my_reservation(uuid), public.claim_reservations(text[])
  to authenticated;
revoke execute on function public.reservation_owner(), public.audit_followers() from public, anon, authenticated;
