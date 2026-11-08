-- =====================================================================
-- Päckli – Runde 5: Abschließen und Wiederverwenden, Erinnerungen, Verschieben
-- Einmal im Supabase SQL Editor ausführen.
-- =====================================================================

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
