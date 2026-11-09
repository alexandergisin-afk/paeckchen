# Päckli – Backlog

Ideen, die wir bewusst zurückgestellt haben. Stand: November 2026.
Aufwand grob: gering (unter einer Runde), mittel (etwa eine Runde), hoch (mehrere Runden).

## Für Schenkende

### Geschenke-Verlauf („Deine Geschenke“)
Schenkende sehen, was sie bisher über Päckli geschenkt haben, nach Kind und Jahr geordnet, mit Gesamtbetrag.
In der Gästeansicht ein Hinweis wie „Du hast Emma bisher ein Kinder-Mikroskop geschenkt“, damit nichts doppelt verschenkt wird.
Entwurf: Zeichenfläche „Päckli – Gestaltungsvorschlag“, dritte Reihe.

- **Variante A (empfohlen):** auf dem Gerät gespeichert. Kein Konto, keine zusätzlichen Daten auf dem Server. Nachteil: nur auf diesem Gerät und Browser. Aufwand gering.
- **Variante B:** freiwilliges Konto für Schenkende, geräteübergreifend. Braucht Zustimmung zur längeren Speicherung (bisher 60 Tage) und eine Anpassung der Zugangsliste. Aufwand hoch.
- **Variante C:** freiwillige Bestätigung per Mail, das Postfach wird zum Verlauf. Aufwand mittel.

## Für Eltern

### Kinder schlagen Wünsche vor
Eigener, einfacher Zugang für Kinder. Vorschläge werden von den Eltern freigegeben, Reservierungen bleiben unsichtbar. Aufwand mittel.

### Danke-Liste nach dem Fest
Wer hat was geschenkt, mit Haken „bedankt“. Die Statistik zeigt die Schenkenden bereits, es fehlt nur das Abhaken. Aufwand gering.

### Anmeldung mit Microsoft oder Google
Ein Tipp statt Mail-Code. Microsoft: Schlüssel läuft nach spätestens 24 Monaten ab. Google ähnlich einfach. Auf dem iPhone in der installierten App holprig. Aufwand gering bis mittel.

## Schweiz-Modus
Preise in CHF, Schweizer Shops in der Shop-Suche (Galaxus, Manor, Orell Füssli), „ss“ statt „ß“.
Die eBay-Suche lässt sich mit dem Secret `EBAY_MARKETPLACE` = `EBAY_CH` auf ebay.ch umstellen, dann aber auch die App auf CHF umstellen. Aufwand gering bis mittel.

## Technik und Betrieb

### Offline-Modus
Die installierte App startet sofort, zuletzt geladene Listen sind auch ohne Netz sichtbar. Braucht eine saubere Update-Meldung, damit niemand auf einer alten Version hängen bleibt. Aufwand mittel.

### Datensicherung
Der Gratis-Tarif von Supabase macht keine Backups. Automatische Sicherung möglich, darf aber keinesfalls im öffentlichen Repository landen. Alternative: Supabase Pro mit täglichen Backups. Aufwand mittel.

### Testumgebung
Zweites Repository (z. B. `paeckchen-test`) und zweites Supabase-Projekt. Neue Versionen erst dort prüfen, dann in die echte App. Sinnvoll, sobald Päckli über die Familie hinauswächst. Aufwand gering bis mittel.

### Shop-Bilder zu Supabase kopieren
Bisher laden Gäste Bilder direkt von den Shop-Servern, die dabei die IP-Adresse sehen. Aufwand mittel.

### Kleinigkeiten
- Eigene Domain, z. B. `wunsch.deine-domain.de` (DNS-Eintrag bei Strato). Aufwand gering.
- GitHub-Automatiken mit festen Prüfsummen statt `@v4`. Aufwand gering.
- Sicherheitswarnungen bei GitHub einschalten (Dependabot), nur eine Einstellung.

## Erst nötig, wenn Päckli öffentlich angeboten wird
- Impressum und Datenschutzerklärung
- Umzug von GitHub Pages zu einem Hoster mit Sicherheitsheadern (GitHub Pages ist für nicht-kommerzielle Projekte gedacht)
- Strengerer Schutz der Link-Vorschau gegen Tricks über Domainnamen

## Erledigt
- **Gruppengeschenke** (November 2026): Eltern schalten „Gemeinsam schenken“ pro Wunsch ein, Gäste steuern Beträge bei und sehen nur die Summe.

## Bewusst verworfen
- **Echte Produktsuche bei Amazon:** braucht ein Partnerkonto mit laufenden Verkäufen.
- **Google-Shopping über Drittanbieter:** kostenpflichtig und rechtlich wacklig.
- **Sofort-Benachrichtigungen:** zugunsten der täglichen Zusammenfassung weggelassen. Die Mailfunktion könnte es technisch noch, es fehlt nur der Zeitplan (Vorlage war `11_zeitplan_sofort.sql`).
- **Preisalarm, Strichcode-Scan:** aufwendig, bei Spielzeug oft unzuverlässig.
