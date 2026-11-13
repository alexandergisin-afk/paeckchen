#!/usr/bin/env bash
# Päckli – Datensicherung: Datenbank + hochgeladene Bilder, verschlüsselt.
# Wird jede Nacht von .github/workflows/sicherung.yml ausgeführt.
#
# Benötigt (als GitHub-Secrets):
#   SUPABASE_DB_URL        Verbindung zur Datenbank (Session-Pooler, siehe BACKUP.md)
#   SUPABASE_URL           z. B. https://abcdefghijkl.supabase.co
#   SUPABASE_SERVICE_KEY   service_role-Schlüssel (nur zum Auflisten der Bilder)
#   BACKUP_PASSWORD        frei gewähltes, langes Passwort zum Verschlüsseln
set -euo pipefail
: "${SUPABASE_DB_URL:?fehlt}" "${BACKUP_PASSWORD:?fehlt}"
OUT="${1:-sicherung}"
STAMP="$(date -u +%Y-%m-%d)"
WORK="$(mktemp -d)"
mkdir -p "$WORK/paeckli-$STAMP/bilder"
DIR="$WORK/paeckli-$STAMP"

echo "1/3 Datenbank sichern …"
# Eure Daten (Schema public) vollständig, dazu die Konten (auth.users/identities) nur als Daten.
# Daten als einfache INSERT-Befehle: lassen sich direkt im SQL-Editor von Supabase zurückspielen.
pg_dump "$SUPABASE_DB_URL" --no-owner --no-privileges --data-only --column-inserts --schema=public --file="$DIR/daten-public.sql"
pg_dump "$SUPABASE_DB_URL" --no-owner --no-privileges --data-only --column-inserts --table=auth.users --table=auth.identities --file="$DIR/konten-auth.sql"
# Zusätzlich das Grundgerüst, falls es vom schema.sql im Repository abweicht
pg_dump "$SUPABASE_DB_URL" --no-owner --no-privileges --schema-only --schema=public --file="$DIR/grundgeruest-public.sql"

echo "2/3 Bilder sichern …"
if [ -n "${SUPABASE_URL:-}" ] && [ -n "${SUPABASE_SERVICE_KEY:-}" ]; then
  list() { # Ordnerinhalt im Bucket wish-images auflisten
    curl -sf -X POST "$SUPABASE_URL/storage/v1/object/list/wish-images" \
      -H "Authorization: Bearer $SUPABASE_SERVICE_KEY" -H "apikey: $SUPABASE_SERVICE_KEY" -H "Content-Type: application/json" \
      -d "{\"prefix\":\"$1\",\"limit\":1000,\"offset\":0}"
  }
  count=0
  for folder in $(list "" | jq -r '.[] | select(.id == null) | .name'); do
    for file in $(list "$folder" | jq -r '.[] | select(.id != null) | .name'); do
      mkdir -p "$DIR/bilder/$folder"
      curl -sf "$SUPABASE_URL/storage/v1/object/public/wish-images/$folder/$file" -o "$DIR/bilder/$folder/$file" && count=$((count+1))
    done
  done
  echo "   $count Bilder gesichert"
else
  echo "   übersprungen (SUPABASE_URL/SUPABASE_SERVICE_KEY fehlen)"
fi

echo "3/3 Verpacken und verschlüsseln …"
cat > "$DIR/LIESMICH.txt" <<TXT
Päckli-Sicherung vom $STAMP (UTC)
daten-public.sql        – alle Listen, Wünsche, Reservierungen usw. (nur Daten)
grundgeruest-public.sql – Tabellen, Funktionen und Regeln zum Zeitpunkt der Sicherung
konten-auth.sql   – die Konten (E-Mail-Adressen) für die Anmeldung
bilder/           – hochgeladene Bilder (Ordner = Listen-ID)
Wiederherstellen: siehe BACKUP.md im Repository.
TXT
mkdir -p "$OUT"
tar -C "$WORK" -czf - "paeckli-$STAMP" \
  | openssl enc -aes-256-cbc -pbkdf2 -iter 200000 -salt -pass env:BACKUP_PASSWORD -out "$OUT/paeckli-$STAMP.tar.gz.enc"
rm -rf "$WORK"
ls -la "$OUT"
