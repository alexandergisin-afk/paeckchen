-- =====================================================================
-- Päckli – „Bitte besorgt ihr es“ nur, wenn die Eltern es für die Liste erlauben
-- Einmal im Supabase SQL Editor ausführen.
-- =====================================================================

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
