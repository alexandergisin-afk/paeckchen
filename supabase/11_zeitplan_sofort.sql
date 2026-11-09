-- =====================================================================
-- Päckli – Zeitplan für „sofortige“ Benachrichtigungen bei neuen Reservierungen
-- Wie bei 07_zeitplan.sql: PROJEKT-REF und GEHEIMNIS ersetzen, dann im SQL Editor ausführen.
-- Der tägliche Zeitplan aus 07 verschickt automatisch auch die tägliche Zusammenfassung.
-- =====================================================================

-- Alle 5 Minuten nach neuen Reservierungen schauen (nur für Eltern mit Einstellung „Sofort“)
select cron.schedule(
  'paeckli-sofort',
  '*/5 * * * *',
  $$ select net.http_post(
       url := 'https://PROJEKT-REF.supabase.co/functions/v1/erinnerungen',
       headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', 'GEHEIMNIS'),
       body := '{"mode": "instant"}'::jsonb
     ) $$
);
