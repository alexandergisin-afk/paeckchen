-- =====================================================================
-- Päckli – Kontoarten: Familie (darf Listen anlegen) und Schenkende (nur schenken)
-- Im Supabase SQL Editor ausführen. Kann gefahrlos mehrfach ausgeführt werden.
--
-- * Neue Konten sind Schenkendenkonten, außer bei Einladung zum Mitbearbeiten oder wenn der
--   Administrator bei der Freigabe „Familie“ wählt.
-- * Nur Familienkonten dürfen eigene Listen anlegen (in der Datenbank durchgesetzt).
-- * Alle bisherigen Konten bleiben Familienkonten; Administratoren können umstellen.
-- =====================================================================

-- Nur beim allerersten Ausführen: Spalten anlegen und alle bisherigen Konten zu Familienkonten machen
-- (bisher war jedes Konto „Familie“). Ein erneutes Ausführen ändert keine Kontoart mehr.
do $$
begin
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'profiles' and column_name = 'account_type') then
    alter table public.profiles add column account_type text not null default 'guest' check (account_type in ('family', 'guest'));
    update public.profiles set account_type = 'family';
  end if;
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'allowed_emails' and column_name = 'account_type') then
    alter table public.allowed_emails add column account_type text not null default 'guest' check (account_type in ('family', 'guest'));
    update public.allowed_emails set account_type = 'family';
  end if;
end $$;

-- Neues Konto: Kontoart aus der Freischaltung übernehmen
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, display_name, account_type)
  values (new.id, left(coalesce(nullif(split_part(new.email, '@', 1), ''), 'Ich'), 60),
          coalesce((select account_type from allowed_emails where email = lower(new.email)), 'guest'))
  on conflict (id) do nothing;
  return new;
end $$;

-- Liste anlegen: nur Familienkonten
create or replace function public.create_list(p_title text, p_recipient_name text default null, p_occasion list_occasion default 'other',
                                   p_event_date date default null, p_cover int default 0, p_description text default null,
                                   p_allow_parents_buy boolean default false)
returns public.lists language plpgsql security definer set search_path = public as $$
declare v_list lists;
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  -- Nur Familienkonten dürfen eigene Listen anlegen (Schenkendenkonten nicht)
  if coalesce((select account_type from profiles where id = auth.uid()), 'guest') <> 'family' then
    raise exception 'family_only' using errcode = '42501';
  end if;
  insert into profiles (id, display_name) values (auth.uid(), 'Ich') on conflict (id) do nothing;
  insert into lists (title, recipient_name, occasion, event_date, cover, description, allow_parents_buy, created_by)
  values (trim(p_title), nullif(trim(p_recipient_name), ''), p_occasion, p_event_date, coalesce(p_cover, 0),
          nullif(trim(p_description), ''), coalesce(p_allow_parents_buy, false), auth.uid())
  returning * into v_list;
  insert into list_members (list_id, user_id, role) values (v_list.id, auth.uid(), 'owner');
  return v_list;
end $$;

-- Einladen durch einen Administrator: Familienkonto
create or replace function public.allow_email(p_email text, p_list uuid default null) returns text
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
    -- Einladung zum Mitbearbeiten: Familienkonto
    insert into allowed_emails (email, note, account_type) values (v_email, 'eingeladen von ' || auth.uid()::text, 'family') on conflict (email) do nothing;
    return 'allowed';
  end if;
  insert into access_requests (email, invited_by, list_id) values (v_email, auth.uid(), p_list)
  on conflict (email) where status = 'pending' do update set invited_by = excluded.invited_by, list_id = excluded.list_id;
  return 'pending';
end $$;

-- Freigeben mit Kontoart (Standard: Schenkender)
drop function if exists public.decide_access(uuid, boolean);
drop function if exists public.decide_access(uuid, boolean, text);
create function public.decide_access(p_id uuid, p_approve boolean, p_type text default 'guest') returns text
language plpgsql security definer set search_path = public as $$
declare v_email text;
begin
  if not is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_type not in ('family', 'guest') then raise exception 'invalid_type' using errcode = '22023'; end if;
  update access_requests set status = case when p_approve then 'approved' else 'denied' end, decided_at = now(), decided_by = auth.uid()
  where id = p_id and status = 'pending'
  returning email into v_email;
  if v_email is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  if p_approve then
    insert into allowed_emails (email, note, account_type) values (v_email, 'freigegeben von ' || auth.uid()::text, p_type)
    on conflict (email) do update set account_type = excluded.account_type;
    update profiles set account_type = p_type where id = (select id from auth.users where lower(email) = v_email);
  end if;
  return v_email;
end $$;

-- Für Administratoren: alle Konten und Kontoart umstellen
create or replace function public.list_accounts()
returns table (id uuid, display_name text, email text, account_type text, is_admin boolean, created_at timestamptz, lists_owned int)
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  return query
    select p.id, p.display_name, u.email::text, p.account_type, exists (select 1 from app_admins a where a.user_id = p.id),
           p.created_at, (select count(*)::int from list_members m where m.user_id = p.id and m.role = 'owner')
    from profiles p join auth.users u on u.id = p.id
    order by p.account_type, p.display_name;
end $$;

create or replace function public.set_account_type(p_user uuid, p_type text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_type not in ('family', 'guest') then raise exception 'invalid_type' using errcode = '22023'; end if;
  update profiles set account_type = p_type where id = p_user;
  update allowed_emails set account_type = p_type where email = (select lower(email) from auth.users where id = p_user);
end $$;

-- Sicherheitsprotokoll: Umstellungen der Kontoart
create or replace function public.audit_account_type() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.account_type is distinct from old.account_type then
    perform audit_write(null, 'access', 'type_changed', new.id, jsonb_build_object('member', new.display_name, 'type', new.account_type));
  end if;
  return null;
end $$;
drop trigger if exists audit_account_type on public.profiles;
create trigger audit_account_type after update of account_type on public.profiles for each row execute function public.audit_account_type();

revoke execute on function public.decide_access(uuid, boolean, text), public.list_accounts(), public.set_account_type(uuid, text)
  from public, anon;
grant execute on function public.decide_access(uuid, boolean, text), public.list_accounts(), public.set_account_type(uuid, text)
  to authenticated;
revoke execute on function public.audit_account_type() from public, anon, authenticated;
