# Päckli

Wunschlisten für Familien: Eltern pflegen Listen, Gäste reservieren ohne Konto.

**Stand: Etappe 1** – Anmeldung per E-Mail-Link, Wunschlisten anlegen, bearbeiten und löschen.
Wünsche, Teilen und Reservieren folgen in Etappe 2.

## Aufbau

- `src/` – die App (React, TypeScript, Vite)
- `supabase/schema.sql` – Datenbank mit allen Rechten und der Reservierungslogik
- `.github/workflows/deploy.yml` – baut die App und stellt sie auf GitHub Pages online

## Zugangsdaten

Die App braucht zwei Werte aus Supabase, eingetragen als **Repository-Variablen** in GitHub
(Settings → Secrets and variables → Actions → Variables):

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY` (der öffentliche „publishable“- bzw. „anon“-Schlüssel)

Beide Werte sind für den Browser bestimmt und dürfen öffentlich sein. Den Schutz der Daten
übernimmt die Datenbank. Den geheimen „service_role“- bzw. „secret“-Schlüssel niemals eintragen.
