-- =====================================================================
-- Päckli – Neue Bearbeiter erst nach Freigabe durch einen Administrator
-- Einmal im Supabase SQL Editor ausführen.
-- WICHTIG: Ganz unten deine eigene E-Mail-Adresse als Administrator eintragen.
--
--  * Lädt ein Administrator ein, wird die Adresse sofort freigeschaltet (wie bisher).
--  * Lädt jemand anderes ein oder meldet sich eine unbekannte Adresse an, entsteht eine Anfrage.
--  * Erst wenn ein Administrator die Anfrage freigibt, bekommt die Person ihre Mail mit dem Code
--    (verschickt die Supabase-Funktion „zugang“).
-- =====================================================================

create table if not exists public.app_admins (
  user_id uuid primary key references public.profiles(id) on delete cascade
);
alter table public.app_admins enable row level security;
create policy "admins see themselves" on public.app_admins for select using (user_id = auth.uid());

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from app_admins where user_id = auth.uid())
$$;

create table if not exists public.access_requests (
  id          uuid primary key default gen_random_uuid(),
  email       text not null,
  status      text not null default 'pending' check (status in ('pending', 'approved', 'denied')),
  invited_by  uuid references public.profiles(id) on delete set null,
  list_id     uuid references public.lists(id) on delete set null,
  created_at  timestamptz not null default now(),
  decided_at  timestamptz,
  decided_by  uuid references public.profiles(id) on delete set null
);
create unique index if not exists access_requests_one_pending on public.access_requests (email) where status = 'pending';
alter table public.access_requests enable row level security;   -- Zugriff nur über die Funktionen unten

create or replace function public.email_known(p_email text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from allowed_emails where email = p_email)
      or exists (select 1 from auth.users where lower(email) = p_email)
$$;

-- Unbekannte Adresse meldet sich an (aufgerufen von der Funktion „zugang“ mit der IP des Absenders)
create or replace function public.request_access(p_email text, p_ip text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_email text := lower(trim(coalesce(p_email, '')));
  v_new   boolean := false;
begin
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or char_length(v_email) > 254 then
    return jsonb_build_object('status', 'invalid_email');
  end if;
  if email_known(v_email) then return jsonb_build_object('status', 'allowed'); end if;
  if rate_limited('access:' || coalesce(p_ip, 'unbekannt'), 5, interval '10 minutes') then
    return jsonb_build_object('status', 'rate_limited');
  end if;
  -- Kürzlich abgelehnt: still bleiben (nicht verraten, keine neue Mail an die Verwaltung)
  if exists (select 1 from access_requests where email = v_email and status = 'denied' and decided_at > now() - interval '30 days') then
    return jsonb_build_object('status', 'pending', 'notify', false);
  end if;
  insert into access_requests (email) values (v_email) on conflict do nothing;
  v_new := found;
  return jsonb_build_object('status', 'pending', 'notify', v_new);
end $$;

-- Einladen: Administratoren schalten direkt frei, alle anderen erzeugen eine Anfrage
drop function if exists public.allow_email(text);
create function public.allow_email(p_email text, p_list uuid default null) returns text
language plpgsql security definer set search_path = public as $$
declare v_email text := lower(trim(coalesce(p_email, '')));
begin
  if auth.uid() is null
     or not exists (select 1 from list_members where user_id = auth.uid() and role = 'owner') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or char_length(v_email) > 254 then
    raise exception 'invalid_email' using errcode = '22023';
  end if;
  if email_known(v_email) then return 'allowed'; end if;
  if is_admin() then
    insert into allowed_emails (email, note) values (v_email, 'eingeladen von ' || auth.uid()::text) on conflict (email) do nothing;
    return 'allowed';
  end if;
  insert into access_requests (email, invited_by, list_id) values (v_email, auth.uid(), p_list)
  on conflict (email) where status = 'pending' do update set invited_by = excluded.invited_by, list_id = excluded.list_id;
  return 'pending';
end $$;

-- Für Administratoren: offene Anfragen
create or replace function public.pending_access_requests()
returns table (id uuid, email text, created_at timestamptz, invited_by_name text, list_title text)
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  return query
    select r.id, r.email, r.created_at, p.display_name, l.title
    from access_requests r
    left join profiles p on p.id = r.invited_by
    left join lists l on l.id = r.list_id
    where r.status = 'pending'
    order by r.created_at;
end $$;

-- Für Administratoren: freigeben oder ablehnen (gibt die E-Mail-Adresse zurück)
create or replace function public.decide_access(p_id uuid, p_approve boolean) returns text
language plpgsql security definer set search_path = public as $$
declare v_email text;
begin
  if not is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  update access_requests set status = case when p_approve then 'approved' else 'denied' end, decided_at = now(), decided_by = auth.uid()
  where id = p_id and status = 'pending'
  returning email into v_email;
  if v_email is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  if p_approve then
    insert into allowed_emails (email, note) values (v_email, 'freigegeben von ' || auth.uid()::text) on conflict (email) do nothing;
  end if;
  return v_email;
end $$;

-- Für die Mail an die Verwaltung (nur der Server)
create or replace function public.admin_emails() returns setof text
language sql stable security definer set search_path = public as $$
  select u.email::text from app_admins a join auth.users u on u.id = a.user_id where u.email is not null
$$;
create or replace function public.access_request_info(p_email text) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('email', r.email, 'invited_by', p.display_name, 'list_title', l.title)
  from access_requests r left join profiles p on p.id = r.invited_by left join lists l on l.id = r.list_id
  where r.email = lower(trim(p_email)) and r.status = 'pending'
$$;

revoke execute on function public.request_access(text, text), public.admin_emails(), public.access_request_info(text), public.email_known(text)
  from public, anon, authenticated;
grant execute on function public.request_access(text, text), public.admin_emails(), public.access_request_info(text) to service_role;
grant execute on function public.allow_email(text, uuid), public.pending_access_requests(), public.decide_access(uuid, boolean), public.is_admin() to authenticated;

-- ---------------------------------------------------------------------
-- DEINE ADRESSE als Administrator eintragen (anpassen und mit ausführen):
-- insert into public.app_admins (user_id)
--   select id from auth.users where lower(email) = lower('DEINE@ADRESSE.de')
--   on conflict do nothing;
-- ---------------------------------------------------------------------
