-- =====================================================================
-- Päckli – Zugriff verwalten (Einstellungen)
-- Einmal im Supabase SQL Editor ausführen.
--
-- 1. Besitzer:innen können Personen, mit denen sie schon eine Liste teilen,
--    direkt zu weiteren eigenen Listen hinzufügen (ohne neuen Einladungslink).
--    Fremde lassen sich so nicht hinzufügen.
-- 2. Mitbearbeiter:innen können eine Liste selbst verlassen.
-- =====================================================================
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
