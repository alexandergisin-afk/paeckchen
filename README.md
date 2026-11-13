# Päckli 🎀

Wunschlisten für Familien. Eltern pflegen die Listen, Gäste reservieren ohne Konto, und niemand
schenkt doppelt. Die Überraschung bleibt geschützt: Wer eine Liste für sich selbst führt, kann die
Reservierungen ausblenden.

- **Für Gäste** so einfach wie möglich: Link öffnen, Geschenk antippen, Namen eintragen, fertig.
- **Für Eltern** alles an einem Ort: Wünsche per Produktsuche, Link oder von Hand, mehrere Listen,
  Mitbearbeiter, Statistik und Erinnerungen per Mail.
- **Läuft als App** auf dem Startbildschirm, auch ohne Internet mit dem zuletzt geladenen Stand.

Die genaue Beschreibung aller Funktionen, Rollen und Abläufe steht in der **[Spezifikation](SPEC.md)**.

---

## Inhalt

- [Funktionen im Überblick](#funktionen-im-überblick)
- [Technik](#technik)
- [Projektstruktur](#projektstruktur)
- [Neu einrichten](#neu-einrichten)
- [Updates einspielen](#updates-einspielen)
- [Tests](#tests)
- [Betrieb](#betrieb)
- [Sicherheit und Datenschutz](#sicherheit-und-datenschutz)
- [Weitere Dokumente](#weitere-dokumente)

---

## Funktionen im Überblick

**Gäste (ohne Konto)**
- Wunschliste über einen Link öffnen, als Kacheln oder Liste, mit Preisfilter
- Wunsch antippen für alle Details, reservieren mit Namen, auf Wunsch „Bitte besorgt ihr es“
- Bei Gruppengeschenken einen Betrag beisteuern oder das Geschenk ganz übernehmen
- Eigene Reservierungen auf dem Gerät sehen und wieder aufheben

**Eltern (mit Konto)**
- Mehrere Listen, sortieren und durch Gedrückthalten verschieben, abschließen, wiederverwenden
- Wünsche in zwei Schritten: Produktsuche bei eBay, Link einfügen oder selbst eintragen; Teilen aus Shop-Apps
- Priorität, Menge, Notiz, eigenes Foto, Gruppengeschenk, Verschieben und Kopieren zwischen Listen
- Reservierungen sehen oder für sich ausblenden, für jemanden reservieren, freigeben (mit „Rückgängig“)
- Mitbearbeiter einladen, Rechte verwalten, Statistik pro Liste, tägliche Mail und Erinnerungen

**Administratoren**
- Neue Bearbeiter erst nach Freigabe: Anfragen per Mail, Freigeben oder Ablehnen in den Einstellungen

---

## Technik

| Bereich | Eingesetzt |
|---|---|
| App | React 18, TypeScript, Vite, eigenes CSS (hell und dunkel), Schriften lokal ausgeliefert |
| Daten | Supabase: PostgreSQL mit Row Level Security, Auth (Code per Mail), Storage, Edge Functions (Deno) |
| Hosting | GitHub Pages, veröffentlicht durch GitHub Actions |
| Offline | Eigener Service Worker (beim Bauen erzeugt) und Gerätespeicher für zuletzt geladene Daten |
| Mail | Strato-SMTP für Anmeldung, Erinnerungen, Benachrichtigungen und Zugangsanfragen |
| Produktsuche | eBay Browse API (über die Edge Function `produkt-suche`) |
| Tests | Vitest (Logik), Playwright (Oberfläche), SQL-Tests gegen eine frische PostgreSQL-Datenbank |

---

## Projektstruktur

```
src/
  pages/            Seiten (Übersicht, Liste, Gästeansicht, Statistik, Einstellungen, …)
  components/       Bausteine (Wunsch-Formular, Kacheln, Dialoge, Platzhalter, …)
  lib/              Logik (Supabase, Zwischenspeicher, Gruppengeschenke, Sortieren, Ziehen, Rückgängig, …)
supabase/
  schema.sql        komplette Datenbank in einer Datei (für neue Projekte)
  02_…18_*.sql      einzelne Ergänzungen in der Reihenfolge ihrer Entstehung (für bestehende Projekte)
  functions/        Edge Functions: link-vorschau, produkt-suche, erinnerungen, zugang
  emails/           Mail-Vorlagen für die Anmeldung
  tests/            Datenbank-Tests (run.sh)
e2e/                Oberflächentests (Playwright) mit nachgebildeter Datenbank
scripts/            sicherung.sh (nächtliche Datensicherung)
.github/workflows/
  deploy.yml        Tests, Bauen, Veröffentlichen auf GitHub Pages
  update.yml        spielt ein hochgeladenes update.zip automatisch ein
  rueckgaengig.yml  nimmt das letzte Update zurück
  sicherung.yml     nächtliche, verschlüsselte Datensicherung
  wachhalten.yml    hält das Gratis-Projekt bei Supabase aktiv
```

---

## Neu einrichten

### 1. Supabase
1. Projekt anlegen (Region Frankfurt).
2. **SQL Editor:** `supabase/schema.sql` komplett ausführen und die eigene Adresse freischalten:
   ```sql
   insert into public.allowed_emails (email) values ('deine@adresse.de');
   ```
   Nach der ersten Anmeldung sich selbst als Administrator eintragen:
   ```sql
   insert into public.app_admins (user_id)
     select id from auth.users where lower(email) = lower('deine@adresse.de');
   ```
3. **Authentication:** eigene SMTP-Verbindung (Strato, Port 465), Mail-Vorlagen aus `supabase/emails/`,
   als Redirect-URL die Adresse der App.
4. **Edge Functions** anlegen, jeweils mit ausgeschaltetem „Verify JWT“ (die Funktionen prüfen selbst):
   `link-vorschau`, `produkt-suche`, `erinnerungen`, `zugang`.
5. **Edge Function Secrets:**

   | Secret | Wofür |
   |---|---|
   | `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` | Mails von `erinnerungen` und `zugang` |
   | `APP_URL` | Links in den Mails, z. B. `https://name.github.io/paeckchen/` |
   | `CRON_SECRET` | schützt den täglichen Aufruf von `erinnerungen` |
   | `EBAY_CLIENT_ID`, `EBAY_CLIENT_SECRET` | Produktsuche (Production-Keyset) |
   | `EBAY_MARKETPLACE` (optional) | `EBAY_DE` (Standard), `EBAY_CH`, `EBAY_AT` |

6. **Database → Extensions:** `pg_cron` und `pg_net` einschalten, dann `supabase/07_zeitplan.sql`
   anpassen und ausführen (täglicher Mail-Lauf, Aufräumen alter Reservierungen).

### 2. GitHub
1. **Settings → Pages:** Quelle „GitHub Actions“.
2. **Settings → Secrets and variables → Actions → Variables:** `VITE_SUPABASE_URL` und `VITE_SUPABASE_ANON_KEY`
   (der öffentliche Schlüssel; den geheimen `service_role`-Schlüssel hier niemals eintragen).
3. **Secrets** für die Datensicherung: siehe [BACKUP.md](BACKUP.md).
4. Ein Push auf `main` startet Tests und Veröffentlichung.

---

## Updates einspielen

1. **Datenbank zuerst:** Liegt dem Update eine nummerierte SQL-Datei bei, diese im SQL Editor ausführen.
   Jede Datei nur einmal, in der Reihenfolge der Nummern.
2. **App:** `update.zip` ohne Entpacken ins Hauptverzeichnis hochladen. Die Automatik entpackt es,
   führt alle Tests aus und veröffentlicht nur, wenn alles grün ist.
3. **Edge Functions:** Nur wenn das Update eine `*.ts`-Datei enthält, die Funktion im Dashboard ersetzen.

**Etwas stimmt nicht?** GitHub → Actions → **„Letztes Update rückgängig machen“** → Run workflow.
Nach etwa zwei Minuten läuft die vorherige Version wieder (betrifft nur die App, nicht die Datenbank).

---

## Tests

```bash
npm ci
npm test                    # Logik (Vitest)
npm run test:e2e            # Oberfläche (Playwright, baut die App selbst)
./supabase/tests/run.sh     # Datenbank (braucht PostgreSQL; PGHOST, PGUSER, PGPASSWORD, PGDATABASE)
```

Bei jeder Veröffentlichung laufen alle drei automatisch (`deploy.yml`). Die Datenbank-Tests bauen das
komplette Schema in einer leeren Datenbank auf und prüfen unter anderem Zugriffsschutz, Doppelbuchungen,
Gruppengeschenke, Bremsklotz und Freigaben. Die Oberflächentests laufen im Handyformat und prüfen auch
Sicherheitsregeln (CSP), Geschwindigkeit, Offline-Start und Touch-Bedienung.

---

## Betrieb

| Was | Wie |
|---|---|
| **Datensicherung** | jede Nacht, verschlüsselt, 30 Tage; Einrichtung und Wiederherstellung in [BACKUP.md](BACKUP.md) |
| **Wachhalten** | jeden Montag ein kurzer Aufruf, damit Supabase das Gratis-Projekt nicht pausiert |
| **Fehlerprotokoll** | Fehler bei Nutzern landen anonym in der Tabelle `client_errors` (Table Editor), 30 Tage |
| **Mails** | täglicher Lauf um 7:00 UTC: Erinnerungen (14 und 3 Tage vorher) und Reservierungs-Zusammenfassung |
| **Zugangsanfragen** | Administratoren bekommen eine Mail und geben in den Einstellungen frei |

---

## Sicherheit und Datenschutz

- **Zugriffsschutz in der Datenbank:** Jede Tabelle hat Row Level Security. Gäste haben keinen
  Tabellenzugriff, nur ausgewählte Funktionen; Namen anderer Schenkender sehen sie nie.
- **Geschlossener Kreis:** Konten nur für freigeschaltete Adressen; neue Bearbeiter erst nach Freigabe
  durch einen Administrator.
- **Geheimnisse als Hash:** Reservierungscodes und Einladungen werden nur als SHA-256 gespeichert.
- **Bremsklotz** gegen Missbrauch: Reservierungen, Code-Versuche, Abfragen und Anfragen sind begrenzt.
- **Content-Security-Policy:** Der Browser führt nur Code von Päckli aus; beim Öffnen gehen keine
  Anfragen an fremde Server (Schriften werden mitgeliefert).
- **Datensparsamkeit:** Von Gästen nur der Name; Reservierungen werden 60 Tage nach dem Anlass gelöscht;
  beim Abmelden wird der Offline-Speicher auf dem Gerät geleert.

---

## Weitere Dokumente

- **[SPEC.md](SPEC.md)** – Spezifikation: Rollen, Anforderungen, Datenmodell, Abläufe (mit Diagrammen)
- **[BACKUP.md](BACKUP.md)** – Datensicherung einrichten und wiederherstellen
- **[BACKLOG.md](BACKLOG.md)** – zurückgestellte Ideen und erledigte Punkte
