-- =====================================================================
-- Päckli – Gruppengeschenk ganz übernehmen = selbst besorgen
-- Im Supabase SQL Editor ausführen. Kann gefahrlos mehrfach ausgeführt werden.
--
-- * Wer ein Gruppengeschenk ganz übernimmt, reserviert es wie einen normalen Wunsch und besorgt es selbst.
--   Das geht nur, solange noch niemand etwas beigesteuert hat.
-- * Danach sind keine Beiträge mehr möglich; ein erster Beitrag über den vollen Betrag wird abgelehnt
--   (Hinweis „take_whole“: dann bitte ganz übernehmen und selbst besorgen).
-- * Gästeansicht, Erinnerungs-Mails und Zähler werten „selbst besorgt“ als vergeben.
-- =====================================================================

-- Hat jemand das Gruppengeschenk ganz übernommen? (Reservierung ohne Betrag)
create or replace function public.gift_self_bought(p_wish uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from reservations where wish_id = p_wish and amount_cents is null and quantity > 0)
$$;
revoke execute on function public.gift_self_bought(uuid) from public, anon, authenticated;

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
  -- Gruppengeschenk ganz übernehmen = selbst besorgen; nur solange noch niemand beigesteuert hat
  if v_group then
    if exists (select 1 from reservations where wish_id = p_wish) then
      return jsonb_build_object('ok', false, 'available', 0,
        'error', case when gift_self_bought(p_wish) then 'already_taken' else 'group_gift_started' end);
    end if;
    p_quantity := v_qty;
    p_parents_buy := false;
  end if;
  select coalesce(sum(quantity), 0) into v_taken from reservations where wish_id = p_wish;
  if v_taken + p_quantity > v_qty then
    return jsonb_build_object('ok', false, 'error', 'already_taken', 'available', greatest(v_qty - v_taken, 0));
  end if;
  v_code := gen_code();
  insert into reservations (wish_id, quantity, guest_name, code_hash, forget_after, parents_buy, entered_by)
  values (p_wish, p_quantity, v_name, hash_code(v_code), coalesce(p_event, current_date) + 60, coalesce(p_parents_buy, false), p_entered_by);
  return jsonb_build_object('ok', true, 'code', v_code);
end $$;

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
  -- Hat jemand das Geschenk ganz übernommen (besorgt es selbst), sind keine Beiträge mehr möglich
  if gift_self_bought(p_wish) then return jsonb_build_object('ok', false, 'error', 'already_taken', 'open_cents', 0); end if;
  v_target := gift_target(v_w);
  v_open := greatest(v_target - gift_funded(p_wish), 0);
  if v_open = 0 then return jsonb_build_object('ok', false, 'error', 'fully_funded', 'open_cents', 0); end if;
  if p_amount is null or p_amount < least(500, v_open) then
    return jsonb_build_object('ok', false, 'error', 'too_little', 'open_cents', v_open);
  end if;
  if p_amount > v_open then return jsonb_build_object('ok', false, 'error', 'too_much', 'open_cents', v_open); end if;
  -- Den vollen Betrag als ersten Beitrag gibt es nicht: Wer alles übernimmt, besorgt es selbst (reserve_core)
  if v_open = v_target and p_amount = v_target then
    return jsonb_build_object('ok', false, 'error', 'take_whole', 'open_cents', v_open);
  end if;
  v_code := gen_code();
  insert into reservations (wish_id, quantity, amount_cents, guest_name, code_hash, forget_after, parents_buy, entered_by)
  values (p_wish, 0, p_amount, v_name, hash_code(v_code), coalesce(p_event, current_date) + 60, true, p_entered_by);
  return jsonb_build_object('ok', true, 'code', v_code, 'open_cents', v_open - p_amount);
end $$;

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
        'contributors', case when w.group_gift then (select count(*) from reservations r where r.wish_id = w.id and r.amount_cents is not null) end,
        'available', case
          when w.group_gift then case when gift_funded(w.id) >= gift_target(w) or gift_self_bought(w.id) then 0 else 1 end
          else w.quantity - coalesce((select sum(r.quantity) from reservations r where r.wish_id = w.id), 0) end
      ) order by w.priority, w.created_at)
      from wishes w where w.list_id = l.id), '[]'::jsonb))
  from lists l where l.guest_token = p_token and l.archived_at is null
$$;

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
           case when w.group_gift then case when gift_funded(w.id) >= gift_target(w) or gift_self_bought(w.id) then w.quantity else 0 end
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
