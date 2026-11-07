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
