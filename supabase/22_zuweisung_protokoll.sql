-- =====================================================================
-- Päckli – Listen beim Freigeben zuweisen, Lücken im Protokoll schließen
-- Im Supabase SQL Editor ausführen. Kann gefahrlos mehrfach ausgeführt werden.
--
-- * Beim Freigeben wählt der Administrator Listen aus (nur eigene). Sobald das Konto entsteht:
--   Konto zum Schenken → Liste in „Wunschlisten zum Schenken“, Familie → Mitbearbeiter.
-- * Protokolliert werden zusätzlich: gelöschte Listen (Sicherheitsprotokoll, weil der Verlauf der
--   Liste mit verschwindet), Einladungslinks erstellt/zurückgezogen, Namensänderungen.
-- =====================================================================

alter table public.access_requests add column if not exists assign_lists uuid[] not null default '{}';

-- Zuweisungen aus freigegebenen Anfragen anwenden (einmalig, danach geleert)
create or replace function public.apply_list_assignments(p_user uuid, p_email text) returns int
language plpgsql security definer set search_path = public as $$
declare r record; v_type text; v_list uuid; v_n int := 0;
begin
  select account_type into v_type from profiles where id = p_user;
  if v_type is null then return 0; end if;
  for r in select id, assign_lists, decided_by from access_requests
           where email = lower(p_email) and status = 'approved' and cardinality(assign_lists) > 0 loop
    foreach v_list in array r.assign_lists loop
      continue when not exists (select 1 from lists where id = v_list);
      if v_type = 'family' then
        insert into list_members (list_id, user_id, role) values (v_list, p_user, 'editor') on conflict do nothing;
      elsif not exists (select 1 from list_members where list_id = v_list and user_id = p_user) then
        insert into list_followers (list_id, user_id, source, added_by) values (v_list, p_user, 'family', r.decided_by) on conflict do nothing;
      end if;
      v_n := v_n + 1;
    end loop;
    update access_requests set assign_lists = '{}' where id = r.id;
  end loop;
  return v_n;
end $$;

-- Neues Konto: Kontoart übernehmen und zugewiesene Listen eintragen
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, display_name, account_type)
  values (new.id, left(coalesce(nullif(split_part(new.email, '@', 1), ''), 'Ich'), 60),
          coalesce((select account_type from allowed_emails where email = lower(new.email)), 'guest'))
  on conflict (id) do nothing;
  perform apply_list_assignments(new.id, new.email);
  return new;
end $$;

-- Freigeben mit Kontoart und Listen (nur Listen, bei denen der Administrator selbst Mitglied ist)
drop function if exists public.decide_access(uuid, boolean);
drop function if exists public.decide_access(uuid, boolean, text);
drop function if exists public.decide_access(uuid, boolean, text, uuid[]);
create function public.decide_access(p_id uuid, p_approve boolean, p_type text default 'guest', p_lists uuid[] default '{}') returns text
language plpgsql security definer set search_path = public as $$
declare v_email text; v_lists uuid[]; v_user uuid;
begin
  if not is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_type not in ('family', 'guest') then raise exception 'invalid_type' using errcode = '22023'; end if;
  select coalesce(array_agg(distinct x), '{}') into v_lists from unnest(coalesce(p_lists, '{}')) x where my_role(x) is not null;
  update access_requests
     set status = case when p_approve then 'approved' else 'denied' end, decided_at = now(), decided_by = auth.uid(),
         assign_lists = case when p_approve then v_lists else '{}' end
   where id = p_id and status = 'pending'
  returning email into v_email;
  if v_email is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  if p_approve then
    insert into allowed_emails (email, note, account_type) values (v_email, 'freigegeben von ' || auth.uid()::text, p_type)
    on conflict (email) do update set account_type = excluded.account_type;
    select id into v_user from auth.users where lower(email) = v_email;
    if v_user is not null then              -- Konto gibt es schon: gleich umsetzen
      update profiles set account_type = p_type where id = v_user;
      perform apply_list_assignments(v_user, v_email);
    end if;
  end if;
  return v_email;
end $$;

-- Offene Anfragen: jetzt mit der Liste der Einladung (zum Vorauswählen)
drop function if exists public.pending_access_requests();
create function public.pending_access_requests()
returns table (id uuid, email text, created_at timestamptz, invited_by_name text, list_title text, list_id uuid)
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  return query
    select r.id, r.email, r.created_at, p.display_name, l.title, r.list_id
    from access_requests r
    left join profiles p on p.id = r.invited_by
    left join lists l on l.id = r.list_id
    where r.status = 'pending'
    order by r.created_at;
end $$;

-- Verlauf „von euch freigegeben“: Name dessen, der freigegeben hat (auch wenn das Konto erst später entsteht)
create or replace function public.audit_followers() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    perform audit_write(new.list_id, 'member', case when new.source = 'family' then 'follower_added' else 'follower_saved' end, new.user_id,
      jsonb_build_object('member', (select display_name from profiles where id = new.user_id)),
      case when new.source = 'family' then (select display_name from profiles where id = new.added_by) end);
  elsif exists (select 1 from lists where id = old.list_id) then
    perform audit_write(old.list_id, 'member', case when auth.uid() = old.user_id then 'follower_left' else 'follower_removed' end, old.user_id,
      jsonb_build_object('member', (select display_name from profiles where id = old.user_id)));
  end if;
  return null;
end $$;

-- Gelöschte Listen: ins Sicherheitsprotokoll (der Verlauf der Liste verschwindet mit ihr)
create or replace function public.audit_list_deleted() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform audit_write(null, 'access', 'list_deleted', old.id, jsonb_build_object('title', old.title, 'recipient', old.recipient_name));
  return old;
end $$;
drop trigger if exists audit_list_deleted on public.lists;
create trigger audit_list_deleted before delete on public.lists for each row execute function public.audit_list_deleted();

-- Einladungslinks: erstellt und zurückgezogen
create or replace function public.audit_invites() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    perform audit_write(new.list_id, 'member', 'invite_created', new.id, '{}'::jsonb);
  elsif tg_op = 'UPDATE' and old.revoked_at is null and new.revoked_at is not null then
    perform audit_write(new.list_id, 'member', 'invite_revoked', new.id, '{}'::jsonb);
  elsif tg_op = 'DELETE' and old.used_at is null and exists (select 1 from lists where id = old.list_id) then
    perform audit_write(old.list_id, 'member', 'invite_revoked', old.id, '{}'::jsonb);
  end if;
  return null;
end $$;
drop trigger if exists audit_invites on public.invites;
create trigger audit_invites after insert or update or delete on public.invites for each row execute function public.audit_invites();

-- Namensänderungen: im Verlauf jeder Liste, in der die Person vorkommt
create or replace function public.audit_renamed() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_list uuid;
begin
  if new.display_name is distinct from old.display_name then
    for v_list in select list_id from list_members where user_id = new.id
                  union select list_id from list_followers where user_id = new.id loop
      perform audit_write(v_list, 'member', 'renamed', new.id, jsonb_build_object('alt', old.display_name, 'neu', new.display_name), new.display_name);
    end loop;
  end if;
  return null;
end $$;
drop trigger if exists audit_renamed on public.profiles;
create trigger audit_renamed after update of display_name on public.profiles for each row execute function public.audit_renamed();

revoke execute on function public.decide_access(uuid, boolean, text, uuid[]), public.pending_access_requests() from public, anon;
grant execute on function public.decide_access(uuid, boolean, text, uuid[]), public.pending_access_requests() to authenticated;
revoke execute on function public.apply_list_assignments(uuid, text), public.audit_list_deleted(), public.audit_invites(),
  public.audit_renamed() from public, anon, authenticated;
