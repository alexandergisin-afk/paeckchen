# Päckli – Datensicherung

Jede Nacht sichert die GitHub-Automatik **„Datensicherung“** die komplette Datenbank (Listen, Wünsche,
Reservierungen, Konten) und alle hochgeladenen Bilder. Die Sicherung ist mit **deinem Passwort verschlüsselt**,
weil das Repository öffentlich ist. Aufbewahrt werden die letzten 30 Tage.

> **Wichtig:** Ohne das Passwort ist eine Sicherung wertlos. Bewahre es in einem Passwort-Manager auf.

## Einmalig einrichten

Unter **GitHub → Settings → Secrets and variables → Actions → Secrets → New repository secret** vier Einträge anlegen:

| Name | Wert | Wo finde ich das? |
|---|---|---|
| `SUPABASE_DB_URL` | Verbindungsadresse der Datenbank | Supabase → oben **Connect** → Reiter **Connection string** → **Session pooler** → URI kopieren und `[YOUR-PASSWORD]` durch dein Datenbank-Passwort ersetzen |
| `SUPABASE_URL` | z. B. `https://abcdefghijkl.supabase.co` | Supabase → Project Settings → Data API → Project URL |
| `SUPABASE_SERVICE_KEY` | der `service_role`-Schlüssel | Supabase → Project Settings → API Keys → `service_role` (geheim!) |
| `BACKUP_PASSWORD` | ein langes, frei gewähltes Passwort | selbst ausdenken, im Passwort-Manager speichern |

Wichtig ist der **Session pooler**: Die direkte Verbindung funktioniert von GitHub aus nicht.
Das Datenbank-Passwort hast du beim Anlegen des Projekts gewählt. Falls du es nicht mehr weißt:
Supabase → Project Settings → Database → **Reset database password** (danach überall aktualisieren, wo es verwendet wird).

**Ausprobieren:** GitHub → **Actions → Datensicherung → Run workflow**. Nach ein bis zwei Minuten erscheint
unten im Lauf unter **Artifacts** die Datei `paeckli-sicherung-JJJJ-MM-TT`.

## Wiederherstellen

### 1. Sicherung herunterladen und entschlüsseln
1. GitHub → Actions → Datensicherung → gewünschten Tag öffnen → unter **Artifacts** herunterladen und entpacken.
   Darin liegt `paeckli-JJJJ-MM-TT.tar.gz.enc`.
2. Im Terminal (Mac/Linux; unter Windows „Git Bash“) im selben Ordner:
   ```bash
   openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -in paeckli-JJJJ-MM-TT.tar.gz.enc | tar -xz
   ```
   Nach Eingabe des Passworts entsteht der Ordner `paeckli-JJJJ-MM-TT` mit:
   - `konten-auth.sql` – die Konten
   - `daten-public.sql` – alle Listen, Wünsche, Reservierungen …
   - `grundgeruest-public.sql` – Tabellen und Regeln zum Zeitpunkt der Sicherung
   - `bilder/` – die hochgeladenen Bilder

### 2. Datenbank wiederherstellen (in ein neues oder geleertes Supabase-Projekt)
1. Im **SQL Editor** den Inhalt von `supabase/schema.sql` aus dem Repository ausführen.
2. Dann einen neuen SQL-Editor-Tab öffnen und **in einem Durchgang** ausführen:
   ```sql
   set session_replication_role = replica;
   -- hier den Inhalt von konten-auth.sql einfügen
   -- hier den Inhalt von daten-public.sql einfügen
   set session_replication_role = origin;
   ```
   Die erste Zeile schaltet Prüfungen während des Einspielens kurz ab, weil Konten und Listen sich gegenseitig brauchen.

### 3. Bilder zurückspielen
Supabase → **Storage → wish-images** → den Inhalt des Ordners `bilder/` hochladen.
Die Unterordner (eine pro Liste) müssen dabei erhalten bleiben.

### 4. Rest wie bei der ersten Einrichtung
Edge Functions (`link-vorschau`, `produkt-suche`, `erinnerungen`, `zugang`) samt Secrets, Zeitpläne (`07_zeitplan.sql`)
und in der App die Repository-Variablen `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`, falls es ein neues Projekt ist.

## Getestet
Der komplette Kreislauf (sichern → verschlüsseln → entschlüsseln → in eine leere Datenbank zurückspielen)
wurde mit allen Tabellen geprüft: Alle Datensätze und Konten waren danach vollständig und identisch vorhanden,
Gästeansicht und Zugriffsschutz funktionierten wie vorher.
