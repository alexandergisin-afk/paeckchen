-- =====================================================================
-- Päckli – Listen in der Übersicht sortieren und verschieben
-- Einmal im Supabase SQL Editor ausführen.
-- Jede Person hat ihre eigene Reihenfolge (gilt auf allen Geräten).
-- =====================================================================

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
