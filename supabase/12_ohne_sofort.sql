-- =====================================================================
-- Päckli – Benachrichtigungen nur noch täglich oder aus
-- Einmal im Supabase SQL Editor ausführen.
-- Wer bisher „Sofort“ gewählt hatte, bekommt ab jetzt die tägliche Zusammenfassung.
-- =====================================================================
update public.profiles set notify_reservations = 'daily' where notify_reservations = 'instant';

alter table public.profiles drop constraint if exists profiles_notify_reservations_check;
alter table public.profiles add constraint profiles_notify_reservations_check
  check (notify_reservations in ('daily', 'off'));
