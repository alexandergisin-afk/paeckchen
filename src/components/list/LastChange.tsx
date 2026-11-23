import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { db } from "../../lib/supabase";
import { describe, relTime, type AuditEntry } from "../../lib/history";
import { IconChevron, IconHistory } from "../Icons";

/**
 * Zeile „Zuletzt“ auf der Listenseite: der neueste Eintrag im Verlauf, ein Tipp öffnet den ganzen Verlauf.
 * Reservierungen blendet die Datenbank aus, wenn man sie sich nicht anzeigen lässt.
 * watch: Daten der Liste; ändert sich eines davon, wird neu geladen.
 */
export function LastChange({ listId, watch }: { listId: string; watch: [unknown, unknown, unknown] }) {
  const [a, b, c] = watch;
  const [entry, setEntry] = useState<AuditEntry | null>(null);
  useEffect(() => {
    const t = window.setTimeout(() => {
      db().from("audit_log").select("id,at,kind,action,actor_name,data").eq("list_id", listId)
        .order("at", { ascending: false }).order("id", { ascending: false }).limit(1)
        .then(({ data }) => setEntry(((data ?? []) as AuditEntry[])[0] ?? null));
    }, 400);
    return () => window.clearTimeout(t);
  }, [listId, a, b, c]);

  if (!entry) return null;
  return (
    <Link className="last-change" to={`/liste/${listId}/verlauf`} aria-label={`Zuletzt: ${describe(entry)} ${relTime(entry.at)}. Ganzen Verlauf ansehen`}>
      <span className="last-change-icon" aria-hidden="true"><IconHistory /></span>
      <span className="last-change-text"><b>Zuletzt:</b> {describe(entry)}</span>
      <span className="last-change-time">{relTime(entry.at)}</span>
      <span className="last-change-chev" aria-hidden="true"><IconChevron /></span>
    </Link>
  );
}
