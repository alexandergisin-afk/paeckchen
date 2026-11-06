-- =====================================================================
-- Päckchen – Etappe 3: E-Mail-Adresse beim Einladen direkt freischalten
-- Einmal im Supabase SQL Editor ausführen.
--
-- Wer mindestens eine eigene Liste besitzt, darf eine Adresse auf die
-- Zugangsliste setzen. So muss beim Einladen niemand in Supabase eintragen.
-- =====================================================================
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
