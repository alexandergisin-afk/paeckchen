-- =====================================================================
-- Päckli – Verlauf (Audit-Trail)
-- Einmal im Supabase SQL Editor ausführen.
--
-- * Jede Änderung an Listen, Wünschen, Reservierungen und Mitgliedern wird per Trigger festgehalten,
--   dazu Zugangsentscheidungen für Administratoren. Niemand kann Einträge ändern oder löschen.
-- * Sichtbar für Mitglieder der Liste; Reservierungs-Einträge nur bei eingeschaltetem „Anzeigen“
--   (Überraschungsschutz). Zugangs-Einträge nur für Administratoren.
-- * Aufbewahrung: Einträge mit Gästenamen so lange wie die Reservierung (60 Tage nach dem Anlass),
--   alles andere ein Jahr.
-- =====================================================================

create table if not exists public.audit_log (
  id           bigint generated always as identity primary key,
  at           timestamptz not null default now(),
  list_id      uuid references public.lists on delete cascade,
  kind         text not null check (kind in ('list', 'wish', 'reservation', 'member', 'access')),
  action       text not null,
  actor_id     uuid references public.profiles on delete set null,
  actor_name   text,             -- Name zum Zeitpunkt der Änderung (oder Gastname)
  entity_id    uuid,
  data         jsonb not null default '{}'::jsonb,
  forget_after date              -- bei Reservierungs-Einträgen: wie die Reservierung
);
create index if not exists audit_log_list_at on public.audit_log (list_id, at desc);
create index if not exists audit_log_kind_at on public.audit_log (kind, at desc);
alter table public.audit_log enable row level security;

create policy "audit members read" on public.audit_log for select to authenticated using (
  list_id is not null
  and exists (select 1 from list_members m where m.list_id = audit_log.list_id and m.user_id = auth.uid()
              and (audit_log.kind <> 'reservation' or m.show_reservations))
);
create policy "audit admins read access" on public.audit_log for select to authenticated using (kind = 'access' and is_admin());
-- keine Policies für insert/update/delete: geschrieben wird nur von den Triggern unten

revoke insert, update, delete on public.audit_log from anon, authenticated;
revoke all on public.audit_log from anon;   -- Gäste brauchen den Verlauf nie

create or replace function public.audit_actor_name() returns text
language sql stable security definer set search_path = public as $$
  select display_name from profiles where id = auth.uid()
$$;

-- Abgelaufenes löschen: Gästenamen wie die Reservierung, alles andere nach einem Jahr
create or replace function public.audit_purge() returns void
language sql security definer set search_path = public as $$
  delete from audit_log where forget_after < current_date or at < now() - interval '1 year'
$$;

-- Eintrag schreiben (nur für die Trigger); räumt gelegentlich Abgelaufenes auf
create or replace function public.audit_write(p_list uuid, p_kind text, p_action text, p_entity uuid, p_data jsonb,
                                              p_actor_name text default null, p_forget date default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into audit_log (list_id, kind, action, actor_id, actor_name, entity_id, data, forget_after)
  values (p_list, p_kind, p_action, auth.uid(), coalesce(p_actor_name, audit_actor_name()), p_entity, coalesce(p_data, '{}'::jsonb), p_forget);
  if random() < 0.02 then perform audit_purge(); end if;
end $$;

-- Hilfe: geänderte Felder als {"feld": {"alt": …, "neu": …}}
create or replace function public.audit_changes(p_old jsonb, p_new jsonb, p_fields text[]) returns jsonb
language sql immutable as $$
  select coalesce(jsonb_object_agg(f, jsonb_build_object('alt', p_old -> f, 'neu', p_new -> f)), '{}'::jsonb)
  from unnest(p_fields) f
  where (p_old -> f) is distinct from (p_new -> f)
$$;

-- ---------------- Listen ----------------
create or replace function public.audit_lists() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_changes jsonb;
begin
  if tg_op = 'INSERT' then
    perform audit_write(new.id, 'list', 'created', new.id, jsonb_build_object('title', new.title));
  elsif tg_op = 'UPDATE' then
    if new.archived_at is distinct from old.archived_at then
      perform audit_write(new.id, 'list', case when new.archived_at is null then 'restored' else 'archived' end, new.id, jsonb_build_object('title', new.title));
    end if;
    if new.guest_token is distinct from old.guest_token then
      perform audit_write(new.id, 'list', 'link_renewed', new.id, '{}'::jsonb); -- der Link selbst wird nie protokolliert
    end if;
    v_changes := audit_changes(to_jsonb(old), to_jsonb(new),
      array['title', 'description', 'recipient_name', 'occasion', 'event_date', 'cover', 'allow_parents_buy']);
    if v_changes <> '{}'::jsonb then
      perform audit_write(new.id, 'list', 'updated', new.id, jsonb_build_object('title', new.title, 'changes', v_changes));
    end if;
  end if;
  return null;
end $$;
drop trigger if exists audit_lists on public.lists;
create trigger audit_lists after insert or update on public.lists for each row execute function public.audit_lists();

-- ---------------- Wünsche ----------------
create or replace function public.audit_wishes() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_changes jsonb;
begin
  if tg_op = 'INSERT' then
    perform audit_write(new.list_id, 'wish', 'created', new.id, jsonb_build_object('title', new.title));
  elsif tg_op = 'DELETE' then
    -- Liste wird gerade gelöscht: dann kein Eintrag (der Verlauf der Liste verschwindet ohnehin)
    if exists (select 1 from lists where id = old.list_id) then
      perform audit_write(old.list_id, 'wish', 'deleted', old.id, jsonb_build_object('title', old.title));
    end if;
  else
    if new.list_id is distinct from old.list_id then
      perform audit_write(old.list_id, 'wish', 'moved_out', new.id, jsonb_build_object('title', new.title, 'to', (select title from lists where id = new.list_id)));
      perform audit_write(new.list_id, 'wish', 'moved_in', new.id, jsonb_build_object('title', new.title, 'from', (select title from lists where id = old.list_id)));
    end if;
    v_changes := audit_changes(to_jsonb(old), to_jsonb(new),
      array['title', 'price_cents', 'quantity', 'priority', 'note', 'url', 'shop', 'group_gift']);
    if new.image_path is distinct from old.image_path then
      v_changes := v_changes || jsonb_build_object('image', jsonb_build_object('alt', old.image_path is not null, 'neu', new.image_path is not null));
    end if;
    if v_changes <> '{}'::jsonb then
      perform audit_write(new.list_id, 'wish', 'updated', new.id, jsonb_build_object('title', new.title, 'changes', v_changes));
    end if;
  end if;
  return null;
end $$;
drop trigger if exists audit_wishes on public.wishes;
create trigger audit_wishes after insert or update or delete on public.wishes for each row execute function public.audit_wishes();

-- ---------------- Reservierungen ----------------
create or replace function public.audit_reservations() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_wish wishes;
begin
  if tg_op = 'INSERT' then
    select * into v_wish from wishes where id = new.wish_id;
    perform audit_write(v_wish.list_id, 'reservation',
      case when new.amount_cents is not null then 'contributed' else 'reserved' end, new.id,
      jsonb_build_object('wish', v_wish.title, 'guest', new.guest_name, 'quantity', new.quantity,
                         'amount_cents', new.amount_cents, 'parents_buy', new.parents_buy,
                         'by_family', new.entered_by is not null),
      -- eingetragen von Eltern: deren Name; sonst der Gast selbst
      case when new.entered_by is not null then null else new.guest_name end,
      new.forget_after);
  else
    select * into v_wish from wishes where id = old.wish_id;
    if v_wish.id is null then return null; end if; -- Wunsch wird gerade gelöscht: kein Einzeleintrag
    perform audit_write(v_wish.list_id, 'reservation',
      case when auth.uid() is null then 'cancelled' else 'released' end, old.id,
      jsonb_build_object('wish', v_wish.title, 'guest', old.guest_name, 'quantity', old.quantity, 'amount_cents', old.amount_cents),
      case when auth.uid() is null then old.guest_name else null end,
      old.forget_after);
  end if;
  return null;
end $$;
drop trigger if exists audit_reservations on public.reservations;
create trigger audit_reservations after insert or delete on public.reservations for each row execute function public.audit_reservations();

-- ---------------- Mitglieder ----------------
create or replace function public.audit_members() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_name text;
begin
  if tg_op = 'INSERT' then
    if new.role = 'owner' then return null; end if; -- Anlegen der Liste ist schon protokolliert
    select display_name into v_name from profiles where id = new.user_id;
    perform audit_write(new.list_id, 'member', case when auth.uid() = new.user_id then 'joined' else 'added' end, new.user_id,
      jsonb_build_object('member', v_name));
  else
    if not exists (select 1 from lists where id = old.list_id) then return null; end if;
    select display_name into v_name from profiles where id = old.user_id;
    perform audit_write(old.list_id, 'member', case when auth.uid() = old.user_id then 'left' else 'removed' end, old.user_id,
      jsonb_build_object('member', v_name));
  end if;
  return null;
end $$;
drop trigger if exists audit_members on public.list_members;
create trigger audit_members after insert or delete on public.list_members for each row execute function public.audit_members();

-- ---------------- Zugang (nur für Administratoren sichtbar) ----------------
create or replace function public.audit_access() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_table_name = 'access_requests' then
    if tg_op = 'INSERT' then
      perform audit_write(null, 'access', case when new.invited_by is null then 'requested' else 'invite_pending' end, new.id,
        jsonb_build_object('email', new.email, 'list', (select title from lists where id = new.list_id)),
        coalesce((select display_name from profiles where id = new.invited_by), new.email));
    elsif new.status is distinct from old.status then
      perform audit_write(null, 'access', new.status, new.id, jsonb_build_object('email', new.email));
    end if;
  elsif tg_table_name = 'allowed_emails' and tg_op = 'INSERT' then
    perform audit_write(null, 'access', 'allowed', null, jsonb_build_object('email', new.email));
  elsif tg_table_name = 'app_admins' then
    perform audit_write(null, 'access', case when tg_op = 'INSERT' then 'admin_added' else 'admin_removed' end, coalesce(new.user_id, old.user_id),
      jsonb_build_object('member', (select display_name from profiles where id = coalesce(new.user_id, old.user_id))));
  end if;
  return null;
end $$;
drop trigger if exists audit_access_requests on public.access_requests;
create trigger audit_access_requests after insert or update on public.access_requests for each row execute function public.audit_access();
drop trigger if exists audit_allowed_emails on public.allowed_emails;
create trigger audit_allowed_emails after insert on public.allowed_emails for each row execute function public.audit_access();
drop trigger if exists audit_app_admins on public.app_admins;
create trigger audit_app_admins after insert or delete on public.app_admins for each row execute function public.audit_access();

revoke execute on function public.audit_write(uuid, text, text, uuid, jsonb, text, date), public.audit_actor_name(), public.audit_purge(),
  public.audit_lists(), public.audit_wishes(), public.audit_reservations(), public.audit_members(), public.audit_access()
  from public, anon, authenticated;
