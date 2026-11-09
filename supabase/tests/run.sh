#!/usr/bin/env bash
# Baut das komplette Schema in einer leeren Datenbank auf und führt die Tests aus.
# Erwartet die üblichen PostgreSQL-Umgebungsvariablen (PGHOST, PGUSER, PGPASSWORD, PGDATABASE).
set -euo pipefail
cd "$(dirname "$0")"
psql -q -v ON_ERROR_STOP=1 -f 00_supabase_stub.sql -f ../schema.sql -f 01_grants.sql
psql -q -X -v ON_ERROR_STOP=1 -f 10_rechte.sql
