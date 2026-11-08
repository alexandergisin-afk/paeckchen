-- =====================================================================
-- Päckli – Zeitplan für die Erinnerungs-Mails
-- Vorher in Supabase unter Database → Extensions „pg_cron“ und „pg_net“ einschalten.
-- Dann PROJEKT-REF und GEHEIMNIS unten ersetzen und im SQL Editor ausführen.
--   PROJEKT-REF: der Teil vor „.supabase.co“ in deiner Project URL
--   GEHEIMNIS:   derselbe Wert wie im Secret CRON_SECRET
-- =====================================================================

-- Täglich um 7:00 UTC (8:00 Uhr Winterzeit, 9:00 Uhr Sommerzeit)
select cron.schedule(
  'paeckli-erinnerungen',
  '0 7 * * *',
  $$ select net.http_post(
       url := 'https://PROJEKT-REF.supabase.co/functions/v1/erinnerungen',
       headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', 'GEHEIMNIS'),
       body := '{}'::jsonb
     ) $$
);

-- Empfohlen: alte Reservierungen 60 Tage nach dem Anlass automatisch löschen (Datensparsamkeit)
select cron.schedule(
  'paeckli-aufraeumen',
  '15 3 * * *',
  $$ delete from public.reservations where forget_after < current_date $$
);

-- ---------------------------------------------------------------------
-- Testen ohne Mails zu verschicken („dry“) – zeigt, was an einem Tag fällig wäre:
--   select net.http_post(
--     url := 'https://PROJEKT-REF.supabase.co/functions/v1/erinnerungen',
--     headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', 'GEHEIMNIS'),
--     body := '{"dry": true, "today": "2026-11-30"}'::jsonb);
-- Ein paar Sekunden später das Ergebnis ansehen:
--   select status_code, content from net._http_response order by id desc limit 1;
-- ---------------------------------------------------------------------
