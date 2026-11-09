-- =====================================================================
-- Päckli – Gruppengeschenke: Gäste steuern einen Betrag bei
-- Einmal im Supabase SQL Editor ausführen.
--
-- Regeln
--  * Eltern schalten „Gemeinsam schenken“ pro Wunsch ein (nur mit Preis).
--  * Ein Beitrag ist eine Reservierung mit Betrag (Stückzahl 0). „Ganz schenken“ = Beitrag über den vollen Betrag.
--  * Beiträge werden auf den offenen Rest begrenzt, mindestens 5 € (außer der Rest ist kleiner).
--  * Gäste sehen nur Summe und Anzahl der Beitragenden, nie Namen oder Einzelbeträge.
--  * Ist alles zusammen, gilt der Wunsch als vergeben. Die Eltern kaufen das Geschenk.
-- =====================================================================

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
