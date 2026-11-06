-- =====================================================================
-- Päckchen – Bildspeicher für Wunschbilder (Etappe 2a)
-- Einmal im Supabase SQL Editor ausführen.
--
-- Bilder sind öffentlich abrufbar, damit Gäste ohne Konto sie sehen.
-- Die Dateinamen sind zufällig und nicht erratbar. Hochladen und Löschen
-- dürfen nur Mitglieder der jeweiligen Liste (Ordnername = Listen-ID).
-- =====================================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('wish-images', 'wish-images', true, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy "wish images upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'wish-images'
              and public.my_role(((storage.foldername(name))[1])::uuid) is not null);

create policy "wish images delete" on storage.objects for delete to authenticated
  using (bucket_id = 'wish-images'
         and public.my_role(((storage.foldername(name))[1])::uuid) is not null);
