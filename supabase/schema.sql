-- =====================================================================
-- Päckli – Datenbankschema Version 1 (Supabase / PostgreSQL)
-- Einmal komplett im Supabase SQL Editor ausführen.
--
-- Prinzipien
--   * Rechte prüft die Datenbank (Row Level Security), nicht die App.
--   * Gäste haben keinen Tabellenzugriff, nur wenige gezielte Funktionen.
--   * Reservierungscodes und Einladungen werden nur als Hash gespeichert.
--   * Doppelreservierungen verhindert eine Zeilensperre (SELECT … FOR UPDATE).
-- =====================================================================
create extension if not exists pgcrypto with schema extensions;

create type list_role     as enum ('owner', 'editor');
create type list_occasion as enum ('birthday', 'christmas', 'other');
create type wish_priority as enum ('heart', 'nice', 'small');

-- ---------------------------------------------------------------------
-- Tabellen
-- ---------------------------------------------------------------------
create table public.profiles (
  id           uuid primary key references auth.users on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 60),
  created_at   timestamptz not null default now()
);

create table public.lists (
  id             uuid primary key default gen_random_uuid(),
  title          text not null check (char_length(title) between 1 and 120),
  description    text check (char_length(description) <= 1000),
  recipient_name text check (char_length(recipient_name) <= 60),
  occasion       list_occasion not null default 'other',
  event_date     date,
  cover          smallint not null default 0 check (cover between 0 and 5),
  -- Gast-Link: im Klartext, damit Eltern ihn jederzeit erneut teilen können.
  -- Er erlaubt nur Ansehen und Reservieren und lässt sich jederzeit erneuern.
  guest_token    text not null unique
                 default translate(encode(extensions.gen_random_bytes(18), 'base64'), '+/=', '-_'),
  created_by     uuid not null references public.profiles(id),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create table public.list_members (
  list_id           uuid not null references public.lists on delete cascade,
  user_id           uuid not null references public.profiles on delete cascade,
  role              list_role not null,
  show_reservations boolean not null default true,   -- persönliche Einstellung „Reservierungen anzeigen“
  added_at          timestamptz not null default now(),
  primary key (list_id, user_id)
);
create unique index one_owner_per_list on public.list_members (list_id) where role = 'owner';
create index list_members_user on public.list_members (user_id);

create table public.invites (
  id          uuid primary key default gen_random_uuid(),
  list_id     uuid not null references public.lists on delete cascade,
  token_hash  bytea not null unique,
  created_by  uuid not null references public.profiles(id),
  expires_at  timestamptz not null default now() + interval '7 days',
  revoked_at  timestamptz,
  used_by     uuid references public.profiles(id),
  used_at     timestamptz
);

create table public.wishes (
  id          uuid primary key default gen_random_uuid(),
  list_id     uuid not null references public.lists on delete cascade,
  title       text not null check (char_length(title) between 1 and 200),
  url         text check (url is null or url ~* '^https?://'),
  shop        text check (char_length(shop) <= 60),
  image_path  text,
  price_cents integer check (price_cents >= 0),
  quantity    integer not null default 1 check (quantity between 1 and 20),
  priority    wish_priority not null default 'nice',
  note        text check (char_length(note) <= 300),
  created_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index wishes_list on public.wishes (list_id);

create table public.reservations (
  id           uuid primary key default gen_random_uuid(),
  wish_id      uuid not null references public.wishes on delete cascade,
  quantity     integer not null default 1 check (quantity >= 1),
  guest_name   text not null check (char_length(guest_name) between 1 and 60),
  code_hash    bytea not null unique,
  created_at   timestamptz not null default now(),
  forget_after date not null                         -- Datensparsamkeit, siehe unten
);
create index reservations_wish on public.reservations (wish_id);

-- ---------------------------------------------------------------------
-- Hilfsfunktionen
-- ---------------------------------------------------------------------
create function public.my_role(p_list uuid) returns list_role
language sql stable security definer set search_path = public as $$
  select role from list_members where list_id = p_list and user_id = auth.uid()
$$;

create function public.gen_code() returns text
language plpgsql volatile set search_path = public, extensions as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';  -- ohne 0/O und 1/I
  b bytea := gen_random_bytes(8);
  r text := '';
begin
  for i in 0..7 loop
    r := r || substr(alphabet, (get_byte(b, i) % 32) + 1, 1);
    if i = 3 then r := r || '-'; end if;
  end loop;
  return r;
end $$;

create function public.norm_code(p text) returns text
language sql immutable as $$
  select regexp_replace(regexp_replace(upper(coalesce(p, '')), '[^A-Z0-9]', '', 'g'), '^(.{4})(.{4})$', '\1-\2')
$$;

create function public.hash_code(p text) returns bytea
language sql immutable set search_path = public, extensions as $$
  select digest(norm_code(p), 'sha256')
$$;

create function public.set_updated_at() returns trigger
language plpgsql as $$ begin new.updated_at := now(); return new; end $$;
create trigger lists_updated  before update on public.lists  for each row execute function public.set_updated_at();
create trigger wishes_updated before update on public.wishes for each row execute function public.set_updated_at();

-- Neues Konto -> Profil mit dem Teil der E-Mail vor dem @ als Anzeigename
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, display_name)
  values (new.id, left(coalesce(nullif(split_part(new.email, '@', 1), ''), 'Ich'), 60))
  on conflict (id) do nothing;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Menge darf nicht unter die bereits reservierte Anzahl sinken
create function public.check_wish_quantity() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_taken int;
begin
  if new.quantity < old.quantity then
    select coalesce(sum(quantity), 0) into v_taken from reservations where wish_id = new.id;
    if new.quantity < v_taken then
      raise exception 'quantity_below_reserved' using errcode = '23514',
        detail = format('Bereits reserviert: %s', v_taken);
    end if;
  end if;
  return new;
end $$;
create trigger wishes_quantity before update of quantity on public.wishes
  for each row execute function public.check_wish_quantity();

-- ---------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------
alter table public.profiles     enable row level security;
alter table public.lists        enable row level security;
alter table public.list_members enable row level security;
alter table public.invites      enable row level security;
alter table public.wishes       enable row level security;
alter table public.reservations enable row level security;

create policy "profile read own"  on public.profiles for select using (id = auth.uid());
create policy "profile update own" on public.profiles for update using (id = auth.uid()) with check (id = auth.uid());
create policy "profile read co-members" on public.profiles for select using (
  exists (select 1 from list_members a join list_members b using (list_id)
          where a.user_id = auth.uid() and b.user_id = profiles.id));

-- Listen: anlegen nur über create_list(), damit die Besitzer-Mitgliedschaft sicher mit entsteht
create policy "lists read"   on public.lists for select using (my_role(id) is not null);
create policy "lists update" on public.lists for update using (my_role(id) is not null);
create policy "lists delete" on public.lists for delete using (my_role(id) = 'owner');

create policy "members read"   on public.list_members for select using (my_role(list_id) is not null);
create policy "members remove" on public.list_members for delete using (my_role(list_id) = 'owner' and role <> 'owner');

create policy "invites read"   on public.invites for select using (my_role(list_id) = 'owner');
create policy "invites revoke" on public.invites for update using (my_role(list_id) = 'owner');

create policy "wishes read"   on public.wishes for select using (my_role(list_id) is not null);
create policy "wishes add"    on public.wishes for insert with check (my_role(list_id) is not null and created_by = auth.uid());
create policy "wishes edit"   on public.wishes for update using (my_role(list_id) is not null);
create policy "wishes delete" on public.wishes for delete using (my_role(list_id) is not null);

-- Reservierungen: Eltern sehen sie (wenn ihr Schalter an ist) und dürfen sie freigeben.
-- Anlegen und Aufheben durch Gäste nur über die Funktionen unten.
create policy "reservations read" on public.reservations for select using (
  exists (select 1 from wishes w join list_members m on m.list_id = w.list_id
          where w.id = wish_id and m.user_id = auth.uid() and m.show_reservations));
create policy "reservations release" on public.reservations for delete using (
  exists (select 1 from wishes w where w.id = wish_id and my_role(w.list_id) is not null));

-- ---------------------------------------------------------------------
-- Funktionen für angemeldete Eltern
-- ---------------------------------------------------------------------
create function public.create_list(p_title text, p_recipient_name text default null, p_occasion list_occasion default 'other',
                                   p_event_date date default null, p_cover int default 0, p_description text default null)
returns public.lists language plpgsql security definer set search_path = public as $$
declare v_list lists;
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  insert into profiles (id, display_name) values (auth.uid(), 'Ich') on conflict (id) do nothing;
  insert into lists (title, recipient_name, occasion, event_date, cover, description, created_by)
  values (trim(p_title), nullif(trim(p_recipient_name), ''), p_occasion, p_event_date, coalesce(p_cover, 0),
          nullif(trim(p_description), ''), auth.uid())
  returning * into v_list;
  insert into list_members (list_id, user_id, role) values (v_list.id, auth.uid(), 'owner');
  return v_list;
end $$;

create function public.set_show_reservations(p_list uuid, p_show boolean) returns void
language sql security definer set search_path = public as $$
  update list_members set show_reservations = p_show where list_id = p_list and user_id = auth.uid()
$$;

create function public.create_invite(p_list uuid) returns text
language plpgsql security definer set search_path = public, extensions as $$
declare v_token text := translate(encode(gen_random_bytes(24), 'base64'), '+/=', '-_');
begin
  if my_role(p_list) is distinct from 'owner' then raise exception 'forbidden' using errcode = '42501'; end if;
  insert into invites (list_id, token_hash, created_by) values (p_list, digest(v_token, 'sha256'), auth.uid());
  return v_token;   -- Klartext nur dieses eine Mal
end $$;

create function public.accept_invite(p_token text) returns uuid
language plpgsql security definer set search_path = public, extensions as $$
declare v_inv invites;
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  select * into v_inv from invites
  where token_hash = digest(p_token, 'sha256') and used_at is null and revoked_at is null and expires_at > now()
  for update;
  if not found then raise exception 'invite_invalid' using errcode = '22023'; end if;
  insert into profiles (id, display_name) values (auth.uid(), 'Ich') on conflict (id) do nothing;
  insert into list_members (list_id, user_id, role) values (v_inv.list_id, auth.uid(), 'editor') on conflict do nothing;
  update invites set used_at = now(), used_by = auth.uid() where id = v_inv.id;
  return v_inv.list_id;
end $$;

create function public.rotate_guest_link(p_list uuid) returns text
language plpgsql security definer set search_path = public, extensions as $$
declare v_token text := translate(encode(gen_random_bytes(18), 'base64'), '+/=', '-_');
begin
  if my_role(p_list) is distinct from 'owner' then raise exception 'forbidden' using errcode = '42501'; end if;
  update lists set guest_token = v_token where id = p_list;
  return v_token;
end $$;

-- ---------------------------------------------------------------------
-- Funktionen für Gäste (ohne Konto)
-- ---------------------------------------------------------------------
-- Gästeansicht: freie Mengen, niemals Namen
create function public.guest_list(p_token text) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id', l.id, 'title', l.title, 'recipient_name', l.recipient_name, 'occasion', l.occasion,
    'event_date', l.event_date, 'description', l.description, 'cover', l.cover,
    'wishes', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', w.id, 'title', w.title, 'url', w.url, 'shop', w.shop, 'image_path', w.image_path,
        'price_cents', w.price_cents, 'quantity', w.quantity, 'priority', w.priority, 'note', w.note,
        'available', w.quantity - coalesce((select sum(r.quantity) from reservations r where r.wish_id = w.id), 0)
      ) order by w.priority, w.created_at)
      from wishes w where w.list_id = l.id), '[]'::jsonb))
  from lists l where l.guest_token = p_token
$$;

-- Reservieren: die Zeilensperre lässt gleichzeitige Klicks nacheinander laufen
create function public.reserve_wish(p_token text, p_wish uuid, p_quantity int, p_name text)
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

  select id, event_date into v_list, v_date from lists where guest_token = p_token;
  if v_list is null then return jsonb_build_object('ok', false, 'error', 'link_invalid'); end if;

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

create function public.cancel_reservation(p_code text) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  delete from reservations where code_hash = hash_code(p_code);
  return jsonb_build_object('ok', found);
end $$;

-- Das Gerät kennt seine Codes und fragt nur deren Stand ab
create function public.my_reservations(p_codes text[])
returns table (code text, wish_id uuid, quantity int)
language sql stable security definer set search_path = public as $$
  select c, r.wish_id, r.quantity
  from unnest(p_codes[1:50]) as c
  join reservations r on r.code_hash = hash_code(c)
$$;

-- ---------------------------------------------------------------------
-- Ausführungsrechte
-- ---------------------------------------------------------------------
revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function public.my_role(uuid) to anon, authenticated;   -- wird von den Policies genutzt
grant execute on function public.create_list(text, text, list_occasion, date, int, text),
                          public.set_show_reservations(uuid, boolean),
                          public.create_invite(uuid), public.accept_invite(text),
                          public.rotate_guest_link(uuid) to authenticated;
grant execute on function public.guest_list(text), public.reserve_wish(text, uuid, int, text),
                          public.cancel_reservation(text), public.my_reservations(text[]) to anon, authenticated;

-- ---------------------------------------------------------------------
-- Datensparsamkeit (später aktivieren, wenn pg_cron eingeschaltet ist):
-- Reservierungen 60 Tage nach dem Anlass löschen.
-- select cron.schedule('forget-reservations', '15 3 * * *',
--   $$delete from public.reservations where forget_after < current_date$$);
-- ---------------------------------------------------------------------

-- ---------------------------------------------------------------------
-- Zugangsliste (identisch mit 02_zugangsliste.sql)
-- ---------------------------------------------------------------------
create table public.allowed_emails (
  email    text primary key check (email = lower(trim(email)) and email like '%@%'),
  note     text,
  added_at timestamptz not null default now()
);

-- Kein Zugriff aus der App. Pflege nur im Supabase-Dashboard (Table Editor oder SQL Editor).
alter table public.allowed_emails enable row level security;

create function public.check_allowed_email() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from allowed_emails where email = lower(trim(new.email))) then
    raise exception 'signup_not_allowed' using errcode = '42501';
  end if;
  return new;
end $$;
revoke execute on function public.check_allowed_email() from public, anon, authenticated;

create trigger before_auth_user_created before insert on auth.users
  for each row execute function public.check_allowed_email();

-- Zum Abschalten, wenn Päckli später für alle offen sein soll:
--   drop trigger before_auth_user_created on auth.users;

-- ---------------------------------------------------------------------
-- Bildspeicher (identisch mit 03_bilder.sql)
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('wish-images', 'wish-images', true, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy "wish images upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'wish-images'
              and public.my_role(((storage.foldername(name))[1])::uuid) is not null);

create policy "wish images delete" on storage.objects for delete to authenticated
  using (bucket_id = 'wish-images'
         and public.my_role(((storage.foldername(name))[1])::uuid) is not null);

-- ---------------------------------------------------------------------
-- Einladungen freischalten (identisch mit 04_einladungen.sql)
-- ---------------------------------------------------------------------
create function public.allow_email(p_email text) returns void
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
  insert into allowed_emails (email, note) values (v_email, 'eingeladen von ' || auth.uid()::text)
  on conflict (email) do nothing;
end $$;

revoke execute on function public.allow_email(text) from public, anon, authenticated;
grant execute on function public.allow_email(text) to authenticated;

-- ---------------------------------------------------------------------
-- Zugriff verwalten (identisch mit 05_zugriff.sql)
-- ---------------------------------------------------------------------
create function public.add_member(p_list uuid, p_user uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if my_role(p_list) is distinct from 'owner' then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_user = auth.uid() then return; end if;
  if not exists (select 1 from list_members a join list_members b using (list_id)
                 where a.user_id = auth.uid() and b.user_id = p_user) then
    raise exception 'not_known' using errcode = '42501';
  end if;
  insert into list_members (list_id, user_id, role) values (p_list, p_user, 'editor')
  on conflict do nothing;
end $$;

revoke execute on function public.add_member(uuid, uuid) from public, anon, authenticated;
grant execute on function public.add_member(uuid, uuid) to authenticated;

create policy "members leave" on public.list_members for delete
  using (user_id = auth.uid() and role <> 'owner');

-- ---------------------------------------------------------------------
-- Runde 5 (identisch mit 06_runde5.sql)
-- ---------------------------------------------------------------------
-- Abgeschlossene (archivierte) Listen: Gast-Link pausiert, Liste bleibt erhalten
alter table public.lists add column if not exists archived_at timestamptz;

-- Erinnerungs-Mails lassen sich pro Person abbestellen
alter table public.profiles add column if not exists reminder_emails boolean not null default true;

-- Protokoll: Welche Erinnerung wurde für welche Liste schon verschickt?
create table if not exists public.list_reminders (
  list_id    uuid not null references public.lists on delete cascade,
  kind       text not null check (kind in ('14d', '3d')),
  event_date date not null,
  sent_at    timestamptz not null default now(),
  primary key (list_id, kind, event_date)
);
alter table public.list_reminders enable row level security;   -- kein Zugriff aus der App

-- Gäste: abgeschlossene Listen sind nicht mehr erreichbar und nicht reservierbar
create or replace function public.guest_list(p_token text) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id', l.id, 'title', l.title, 'recipient_name', l.recipient_name, 'occasion', l.occasion,
    'event_date', l.event_date, 'description', l.description, 'cover', l.cover,
    'wishes', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', w.id, 'title', w.title, 'url', w.url, 'shop', w.shop, 'image_path', w.image_path,
        'price_cents', w.price_cents, 'quantity', w.quantity, 'priority', w.priority, 'note', w.note,
        'available', w.quantity - coalesce((select sum(r.quantity) from reservations r where r.wish_id = w.id), 0)
      ) order by w.priority, w.created_at)
      from wishes w where w.list_id = l.id), '[]'::jsonb))
  from lists l where l.guest_token = p_token and l.archived_at is null
$$;

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

-- Reservierte Wünsche dürfen nicht in eine andere Liste wandern
-- (die Gäste der alten Liste würden ihre Reservierung sonst aus den Augen verlieren)
create or replace function public.check_wish_move() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.list_id is distinct from old.list_id
     and exists (select 1 from reservations where wish_id = new.id) then
    raise exception 'has_reservations' using errcode = '23514';
  end if;
  return new;
end $$;
drop trigger if exists wishes_move on public.wishes;
create trigger wishes_move before update of list_id on public.wishes
  for each row execute function public.check_wish_move();

-- Erinnerungen: fällige Listen (in 14 oder 3 Tagen) samt Empfängern und Stand.
-- Empfänger mit ausgeschaltetem „Reservierungen anzeigen“ bekommen die Mail ohne Zahlen.
create or replace function public.reminder_batch(p_today date default current_date)
returns table (list_id uuid, kind text, event_date date, title text, recipient_name text,
               total int, taken int, hearts int, hearts_taken int,
               emails_with_stats text[], emails_plain text[])
language sql stable security definer set search_path = public as $$
  with due as (
    select l.id, l.title, l.recipient_name, l.event_date,
           case when l.event_date = p_today + 14 then '14d' else '3d' end as kind
    from lists l
    where l.archived_at is null and l.event_date in (p_today + 14, p_today + 3)
  ), wq as (
    select w.list_id, w.quantity, w.priority,
           least(w.quantity, coalesce((select sum(r.quantity) from reservations r where r.wish_id = w.id), 0)) as tq
    from wishes w where w.list_id in (select id from due)
  )
  select d.id, d.kind, d.event_date, d.title, d.recipient_name,
         coalesce((select sum(quantity) from wq where wq.list_id = d.id), 0)::int,
         coalesce((select sum(tq) from wq where wq.list_id = d.id), 0)::int,
         (select count(*) from wq where wq.list_id = d.id and priority = 'heart')::int,
         (select count(*) from wq where wq.list_id = d.id and priority = 'heart' and tq >= quantity)::int,
         array(select u.email::text from list_members m join auth.users u on u.id = m.user_id join profiles p on p.id = m.user_id
               where m.list_id = d.id and p.reminder_emails and m.show_reservations and u.email is not null),
         array(select u.email::text from list_members m join auth.users u on u.id = m.user_id join profiles p on p.id = m.user_id
               where m.list_id = d.id and p.reminder_emails and not m.show_reservations and u.email is not null)
  from due d
  where not exists (select 1 from list_reminders lr where lr.list_id = d.id and lr.kind = d.kind and lr.event_date = d.event_date)
$$;

create or replace function public.mark_reminder_sent(p_list uuid, p_kind text, p_event_date date) returns void
language sql security definer set search_path = public as $$
  insert into list_reminders (list_id, kind, event_date) values (p_list, p_kind, p_event_date) on conflict do nothing
$$;

revoke execute on function public.reminder_batch(date), public.mark_reminder_sent(uuid, text, date), public.check_wish_move()
  from public, anon, authenticated;
grant execute on function public.reminder_batch(date), public.mark_reminder_sent(uuid, text, date) to service_role;

-- ---------------------------------------------------------------------
-- Sicherheit (identisch mit 08_sicherheit.sql)
-- ---------------------------------------------------------------------
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

-- ---------------------------------------------------------------------
-- Fehlerprotokoll (identisch mit 09_fehlerprotokoll.sql)
-- ---------------------------------------------------------------------
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

-- ---------------------------------------------------------------------
-- Eltern besorgen, Eltern reservieren, Benachrichtigungen (identisch mit 10_reservierungen.sql)
-- ---------------------------------------------------------------------
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

-- ---------------------------------------------------------------------
-- Benachrichtigungen nur täglich oder aus (identisch mit 12_ohne_sofort.sql)
-- ---------------------------------------------------------------------
update public.profiles set notify_reservations = 'daily' where notify_reservations = 'instant';

alter table public.profiles drop constraint if exists profiles_notify_reservations_check;
alter table public.profiles add constraint profiles_notify_reservations_check
  check (notify_reservations in ('daily', 'off'));

-- ---------------------------------------------------------------------
-- Gruppengeschenke (identisch mit 13_gruppengeschenk.sql)
-- ---------------------------------------------------------------------
alter table public.wishes add column if not exists group_gift boolean not null default false;
alter table public.wishes drop constraint if exists wishes_group_gift_needs_price;
alter table public.wishes add constraint wishes_group_gift_needs_price check (not group_gift or price_cents is not null);

alter table public.reservations add column if not exists amount_cents integer check (amount_cents is null or amount_cents >= 1);
alter table public.reservations drop constraint if exists reservations_quantity_check;
alter table public.reservations add constraint reservations_quantity_check
  check (quantity >= 1 or (quantity = 0 and amount_cents is not null));

-- Ziel und bisher zugesagter Betrag eines Wunsches
create or replace function public.gift_target(w public.wishes) returns int
language sql immutable as $$ select coalesce(w.price_cents, 0) * w.quantity $$;
create or replace function public.gift_funded(p_wish uuid) returns int
language sql stable security definer set search_path = public as $$
  select coalesce(sum(amount_cents), 0)::int from reservations where wish_id = p_wish
$$;

-- Umschalten nur, solange es nicht zu Widersprüchen führt
create or replace function public.check_group_gift_switch() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.group_gift is distinct from old.group_gift and exists (select 1 from reservations where wish_id = new.id) then
    raise exception 'group_gift_has_reservations' using errcode = '23514',
      detail = 'Bei diesem Wunsch gibt es schon Reservierungen oder Beiträge.';
  end if;
  return new;
end $$;
drop trigger if exists wishes_group_gift_switch on public.wishes;
create trigger wishes_group_gift_switch before update of group_gift on public.wishes
  for each row execute function public.check_group_gift_switch();

-- Normales Reservieren ist bei Gruppengeschenken nicht möglich (dafür gibt es Beiträge)
create or replace function public.reserve_core(p_list uuid, p_event date, p_wish uuid, p_quantity int, p_name text,
                                               p_parents_buy boolean, p_entered_by uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_qty   int;
  v_group boolean;
  v_taken int;
  v_code  text;
  v_name  text := left(trim(coalesce(p_name, '')), 60);
begin
  if v_name = '' then return jsonb_build_object('ok', false, 'error', 'name_required'); end if;
  if p_quantity is null or p_quantity < 1 or p_quantity > 20 then
    return jsonb_build_object('ok', false, 'error', 'invalid_quantity');
  end if;
  select quantity, group_gift into v_qty, v_group from wishes where id = p_wish and list_id = p_list for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'wish_not_found'); end if;
  if v_group then return jsonb_build_object('ok', false, 'error', 'group_gift'); end if;
  select coalesce(sum(quantity), 0) into v_taken from reservations where wish_id = p_wish;
  if v_taken + p_quantity > v_qty then
    return jsonb_build_object('ok', false, 'error', 'already_taken', 'available', greatest(v_qty - v_taken, 0));
  end if;
  v_code := gen_code();
  insert into reservations (wish_id, quantity, guest_name, code_hash, forget_after, parents_buy, entered_by)
  values (p_wish, p_quantity, v_name, hash_code(v_code), coalesce(p_event, current_date) + 60, coalesce(p_parents_buy, false), p_entered_by);
  return jsonb_build_object('ok', true, 'code', v_code);
end $$;

-- Kern fürs Beisteuern: gesperrt wie das Reservieren, begrenzt auf den offenen Rest
create or replace function public.contribute_core(p_list uuid, p_event date, p_wish uuid, p_amount int, p_name text, p_entered_by uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_w      wishes;
  v_target int;
  v_open   int;
  v_code   text;
  v_name   text := left(trim(coalesce(p_name, '')), 60);
begin
  if v_name = '' then return jsonb_build_object('ok', false, 'error', 'name_required'); end if;
  select * into v_w from wishes where id = p_wish and list_id = p_list for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'wish_not_found'); end if;
  if not v_w.group_gift then return jsonb_build_object('ok', false, 'error', 'not_group_gift'); end if;
  v_target := gift_target(v_w);
  v_open := greatest(v_target - gift_funded(p_wish), 0);
  if v_open = 0 then return jsonb_build_object('ok', false, 'error', 'fully_funded', 'open_cents', 0); end if;
  if p_amount is null or p_amount < least(500, v_open) then
    return jsonb_build_object('ok', false, 'error', 'too_little', 'open_cents', v_open);
  end if;
  if p_amount > v_open then return jsonb_build_object('ok', false, 'error', 'too_much', 'open_cents', v_open); end if;
  v_code := gen_code();
  insert into reservations (wish_id, quantity, amount_cents, guest_name, code_hash, forget_after, parents_buy, entered_by)
  values (p_wish, 0, p_amount, v_name, hash_code(v_code), coalesce(p_event, current_date) + 60, true, p_entered_by);
  return jsonb_build_object('ok', true, 'code', v_code, 'open_cents', v_open - p_amount);
end $$;

-- Gäste: mit Link und Bremsklotz
create or replace function public.contribute(p_token text, p_wish uuid, p_amount_cents int, p_name text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_list uuid; v_date date;
begin
  select id, event_date into v_list, v_date from lists where guest_token = p_token and archived_at is null;
  if v_list is null then return jsonb_build_object('ok', false, 'error', 'link_invalid'); end if;
  if rate_limited('reserve:' || v_list, 10, interval '1 minute') then
    return jsonb_build_object('ok', false, 'error', 'rate_limited');
  end if;
  return contribute_core(v_list, v_date, p_wish, p_amount_cents, p_name, null);
end $$;

-- Eltern: Beitrag für jemanden eintragen oder den Rest selbst übernehmen
create or replace function public.contribute_for_guest(p_wish uuid, p_amount_cents int, p_name text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_list uuid; v_date date;
begin
  select w.list_id, l.event_date into v_list, v_date from wishes w join lists l on l.id = w.list_id where w.id = p_wish;
  if v_list is null or my_role(v_list) is null then raise exception 'forbidden' using errcode = '42501'; end if;
  return contribute_core(v_list, v_date, p_wish, p_amount_cents, p_name, auth.uid());
end $$;

-- Gästeansicht: bei Gruppengeschenken Ziel, Summe und Anzahl, nie Namen
create or replace function public.guest_list(p_token text) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id', l.id, 'title', l.title, 'recipient_name', l.recipient_name, 'occasion', l.occasion,
    'event_date', l.event_date, 'description', l.description, 'cover', l.cover,
    'wishes', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', w.id, 'title', w.title, 'url', w.url, 'shop', w.shop, 'image_path', w.image_path,
        'price_cents', w.price_cents, 'quantity', w.quantity, 'priority', w.priority, 'note', w.note,
        'group_gift', w.group_gift,
        'target_cents', case when w.group_gift then gift_target(w) end,
        'funded_cents', case when w.group_gift then gift_funded(w.id) end,
        'contributors', case when w.group_gift then (select count(*) from reservations r where r.wish_id = w.id) end,
        'available', case
          when w.group_gift then case when gift_funded(w.id) >= gift_target(w) then 0 else 1 end
          else w.quantity - coalesce((select sum(r.quantity) from reservations r where r.wish_id = w.id), 0) end
      ) order by w.priority, w.created_at)
      from wishes w where w.list_id = l.id), '[]'::jsonb))
  from lists l where l.guest_token = p_token and l.archived_at is null
$$;

-- Eigene Reservierungen/Beiträge: jetzt mit Betrag (Rückgabetyp ändert sich, daher neu anlegen)
drop function if exists public.my_reservations(text[]);
create function public.my_reservations(p_codes text[])
returns table (code text, wish_id uuid, quantity int, amount_cents int)
language plpgsql security definer set search_path = public as $$
begin
  if rate_limited('mine:' || client_ip(), 30, interval '1 minute') then return; end if;
  return query
    select c, r.wish_id, r.quantity, r.amount_cents
    from unnest(p_codes[1:50]) as c
    join reservations r on r.code_hash = hash_code(c);
end $$;

-- Erinnerungen: Gruppengeschenk zählt erst als vergeben, wenn alles zusammen ist
create or replace function public.reminder_batch(p_today date default current_date)
returns table (list_id uuid, kind text, event_date date, title text, recipient_name text,
               total int, taken int, hearts int, hearts_taken int,
               emails_with_stats text[], emails_plain text[])
language sql stable security definer set search_path = public as $$
  with due as (
    select l.id, l.title, l.recipient_name, l.event_date,
           case when l.event_date = p_today + 14 then '14d' else '3d' end as kind
    from lists l
    where l.archived_at is null and l.event_date in (p_today + 14, p_today + 3)
  ), wq as (
    select w.list_id, w.quantity, w.priority,
           case when w.group_gift then case when gift_funded(w.id) >= gift_target(w) then w.quantity else 0 end
                else least(w.quantity, coalesce((select sum(r.quantity) from reservations r where r.wish_id = w.id), 0)) end as tq
    from wishes w where w.list_id in (select id from due)
  )
  select d.id, d.kind, d.event_date, d.title, d.recipient_name,
         coalesce((select sum(quantity) from wq where wq.list_id = d.id), 0)::int,
         coalesce((select sum(tq) from wq where wq.list_id = d.id), 0)::int,
         (select count(*) from wq where wq.list_id = d.id and priority = 'heart')::int,
         (select count(*) from wq where wq.list_id = d.id and priority = 'heart' and tq >= quantity)::int,
         array(select u.email::text from list_members m join auth.users u on u.id = m.user_id join profiles p on p.id = m.user_id
               where m.list_id = d.id and p.reminder_emails and m.show_reservations and u.email is not null),
         array(select u.email::text from list_members m join auth.users u on u.id = m.user_id join profiles p on p.id = m.user_id
               where m.list_id = d.id and p.reminder_emails and not m.show_reservations and u.email is not null)
  from due d
  where not exists (select 1 from list_reminders lr where lr.list_id = d.id and lr.kind = d.kind and lr.event_date = d.event_date)
$$;

-- Tägliche Mail: Beiträge mit Betrag
create or replace function public.reservation_notices(p_mode text, p_since timestamptz, p_until timestamptz)
returns table (email text, list_id uuid, list_title text, items jsonb)
language sql stable security definer set search_path = public as $$
  select u.email::text, l.id, l.title,
         jsonb_agg(jsonb_build_object('wish', w.title, 'name', r.guest_name, 'quantity', r.quantity, 'amount_cents', r.amount_cents,
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

revoke execute on function public.contribute_core(uuid, date, uuid, int, text, uuid), public.gift_funded(uuid),
  public.check_group_gift_switch() from public, anon, authenticated;
grant execute on function public.contribute(text, uuid, int, text), public.my_reservations(text[]) to anon, authenticated;
grant execute on function public.contribute_for_guest(uuid, int, text) to authenticated;
grant execute on function public.gift_target(public.wishes) to anon, authenticated;

-- ---------------------------------------------------------------------
-- „Bitte besorgt ihr es“ pro Liste (identisch mit 14_eltern_besorgen.sql)
-- ---------------------------------------------------------------------
alter table public.lists add column if not exists allow_parents_buy boolean not null default false;

-- Listen, bei denen Gäste die Option schon genutzt haben, behalten sie
update public.lists l set allow_parents_buy = true
where exists (select 1 from public.reservations r join public.wishes w on w.id = r.wish_id
              where w.list_id = l.id and r.parents_buy and r.amount_cents is null);

-- Liste anlegen: mit der neuen Einstellung
drop function if exists public.create_list(text, text, list_occasion, date, int, text);
create function public.create_list(p_title text, p_recipient_name text default null, p_occasion list_occasion default 'other',
                                   p_event_date date default null, p_cover int default 0, p_description text default null,
                                   p_allow_parents_buy boolean default false)
returns public.lists language plpgsql security definer set search_path = public as $$
declare v_list lists;
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  insert into profiles (id, display_name) values (auth.uid(), 'Ich') on conflict (id) do nothing;
  insert into lists (title, recipient_name, occasion, event_date, cover, description, allow_parents_buy, created_by)
  values (trim(p_title), nullif(trim(p_recipient_name), ''), p_occasion, p_event_date, coalesce(p_cover, 0),
          nullif(trim(p_description), ''), coalesce(p_allow_parents_buy, false), auth.uid())
  returning * into v_list;
  insert into list_members (list_id, user_id, role) values (v_list.id, auth.uid(), 'owner');
  return v_list;
end $$;
revoke execute on function public.create_list(text, text, list_occasion, date, int, text, boolean) from public, anon;
grant execute on function public.create_list(text, text, list_occasion, date, int, text, boolean) to authenticated;

-- Gäste: Wunsch „Bitte besorgt ihr es“ zählt nur, wenn die Liste es erlaubt
create or replace function public.reserve_wish(p_token text, p_wish uuid, p_quantity int, p_name text, p_parents_buy boolean default false)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_list uuid; v_date date; v_allow boolean;
begin
  select id, event_date, allow_parents_buy into v_list, v_date, v_allow from lists where guest_token = p_token and archived_at is null;
  if v_list is null then return jsonb_build_object('ok', false, 'error', 'link_invalid'); end if;
  if rate_limited('reserve:' || v_list, 10, interval '1 minute') then
    return jsonb_build_object('ok', false, 'error', 'rate_limited');
  end if;
  return reserve_core(v_list, v_date, p_wish, p_quantity, p_name, coalesce(p_parents_buy, false) and v_allow, null);
end $$;

-- Gästeansicht: weiß, ob die Option angeboten wird
create or replace function public.guest_list(p_token text) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id', l.id, 'title', l.title, 'recipient_name', l.recipient_name, 'occasion', l.occasion,
    'event_date', l.event_date, 'description', l.description, 'cover', l.cover,
    'allow_parents_buy', l.allow_parents_buy,
    'wishes', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', w.id, 'title', w.title, 'url', w.url, 'shop', w.shop, 'image_path', w.image_path,
        'price_cents', w.price_cents, 'quantity', w.quantity, 'priority', w.priority, 'note', w.note,
        'group_gift', w.group_gift,
        'target_cents', case when w.group_gift then gift_target(w) end,
        'funded_cents', case when w.group_gift then gift_funded(w.id) end,
        'contributors', case when w.group_gift then (select count(*) from reservations r where r.wish_id = w.id) end,
        'available', case
          when w.group_gift then case when gift_funded(w.id) >= gift_target(w) then 0 else 1 end
          else w.quantity - coalesce((select sum(r.quantity) from reservations r where r.wish_id = w.id), 0) end
      ) order by w.priority, w.created_at)
      from wishes w where w.list_id = l.id), '[]'::jsonb))
  from lists l where l.guest_token = p_token and l.archived_at is null
$$;

-- ---------------------------------------------------------------------
-- Listen sortieren und verschieben (identisch mit 15_listen_reihenfolge.sql)
-- ---------------------------------------------------------------------
alter table public.list_members add column if not exists sort_order int;

alter table public.profiles add column if not exists list_sort text not null default 'custom'
  check (list_sort in ('custom', 'date', 'new', 'name'));

-- Eigene Reihenfolge speichern: Position in der Liste der IDs = Platz in der Übersicht.
-- Ändert nur die eigenen Einträge, nie die anderer Mitglieder.
create or replace function public.set_list_order(p_ids uuid[]) returns void
language sql security definer set search_path = public as $$
  update list_members m set sort_order = x.ord
  from unnest(p_ids[1:200]) with ordinality as x(id, ord)
  where m.list_id = x.id and m.user_id = auth.uid()
$$;

revoke execute on function public.set_list_order(uuid[]) from public, anon;
grant execute on function public.set_list_order(uuid[]) to authenticated;

-- ---------------------------------------------------------------------
-- Zuletzt gesucht pro Person (identisch mit 16_letzte_suchen.sql)
-- ---------------------------------------------------------------------
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

-- ---------------------------------------------------------------------
-- Freigabe neuer Bearbeiter (identisch mit 17_freigabe.sql)
-- ---------------------------------------------------------------------
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
