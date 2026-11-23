import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { cover as coverOf } from "../lib/types";
import { dateLabel, daysChip } from "../lib/format";
import { IconChevron } from "./Icons";

/** Was eine Listenzeile anzeigt */
export interface RowList {
  title: string;
  recipient_name?: string | null;
  event_date?: string | null;
  cover: number;
}

/**
 * Inhalt einer Listenzeile: Symbol, Titel, „Für …, Datum“ mit Countdown, Pfeil.
 * Der äußere Rahmen (Link, Knopf, Ziehen) bleibt bei der jeweiligen Seite.
 */
export function ListRowBody({ list, meta = true, days = true, badge, children }: {
  list: RowList;
  meta?: boolean;          // Zeile „Für …, Datum“ anzeigen
  days?: boolean;          // Countdown „in 31 Tagen“ anzeigen
  badge?: ReactNode;       // z. B. „Mitbearbeiter“
  children?: ReactNode;    // weitere Zeilen, z. B. Fortschritt
}) {
  const c = coverOf(list.cover);
  const d = days ? daysChip(list.event_date ?? null) : null;
  return (
    <>
      <span className={`list-cover t${c.t}`} aria-hidden="true">{c.e}</span>
      <span className="list-text">
        <span className="list-title">{list.title}</span>
        {meta && (
          <span className="list-meta">
            {[list.recipient_name ? `Für ${list.recipient_name}` : "", dateLabel(list.event_date ?? null)].filter(Boolean).join(", ")}
            {d && <span className={`days-chip ${d.soon ? "soon" : ""}`}>{d.text}</span>}
            {badge}
          </span>
        )}
        {children}
      </span>
      <span className="list-chev" aria-hidden="true"><IconChevron /></span>
    </>
  );
}

/** Listenzeile mit ×-Knopf zum Entfernen aus einer Übersicht (für Wunschlisten zum Schenken) */
export function RemovableListRow({ to, list, removeLabel, onRemove }: {
  to: string; list: RowList; removeLabel: string; onRemove: () => void;
}) {
  return (
    <div className="guest-home-row">
      <Link className="list-row" to={to}><ListRowBody list={list} /></Link>
      <button type="button" className="guest-home-x" aria-label={removeLabel} onClick={onRemove}>×</button>
    </div>
  );
}
