import { useEffect, useState } from "react";
import { PRIORITIES, type Reservation, type Wish } from "../lib/types";
import { formatPrice, guessEmoji, imageUrl, tintFor } from "../lib/wishes";
import { Bow, IconChevron } from "./Icons";

/** Produktkachel. „wrapped“ legt die Geschenkschleife darum (= vergeben), „animate“ bindet sie sichtbar zu. */
export function WishTile({ wish, wrapped = false, animate = false, className = "" }: {
  wish: { id: string; title: string; image_path: string | null };
  wrapped?: boolean;
  animate?: boolean;
  className?: string;
}) {
  const [on, setOn] = useState(wrapped && !animate);
  useEffect(() => {
    if (!animate) return setOn(wrapped);
    const t = window.setTimeout(() => setOn(wrapped), 60);
    return () => window.clearTimeout(t);
  }, [wrapped, animate]);
  const [broken, setBroken] = useState(false);
  const img = broken ? null : imageUrl(wish.image_path);
  return (
    <div className={`tile t${tintFor(wish.id)} ${on ? "wrapped" : ""} ${className}`}>
      {img ? (
        <img src={img} alt="" loading="lazy" referrerPolicy="no-referrer" className={/^https?:/.test(wish.image_path ?? "") ? "shopimg" : ""} onError={() => setBroken(true)} />
      ) : (
        <span className="emo" aria-hidden="true">{guessEmoji(wish.title)}</span>
      )}
      <i className="wrap-v" />
      <i className="wrap-h" />
      <Bow />
    </div>
  );
}

export function PriorityBadge({ priority }: { priority: Wish["priority"] }) {
  const p = PRIORITIES[priority];
  return <span className={`badge ${p.cls}`}>{p.icon} {p.label}</span>;
}

/** Statuszeile für Eltern: „Noch frei“, „Reserviert von …“ oder „1 reserviert von …, noch 2 frei“. */
export function reservationStatus(wish: Wish, reservations: Reservation[]): { text: string; free: boolean } {
  const taken = reservations.reduce((a, r) => a + r.quantity, 0);
  const free = wish.quantity - taken;
  if (!reservations.length) return { text: "Noch frei", free: true };
  const names = reservations.map((r) => {
    const extra = [r.quantity > 1 ? `${r.quantity} Stück` : "", r.parents_buy ? "ihr besorgt" : ""].filter(Boolean).join(", ");
    return extra ? `${r.guest_name} (${extra})` : r.guest_name;
  });
  const who = names.length > 1 ? `${names.slice(0, -1).join(", ")} und ${names[names.length - 1]}` : names[0];
  if (free <= 0) return { text: `Reserviert von ${who}`, free: false };
  return { text: `${taken} reserviert von ${who}, noch ${free} frei`, free: false };
}

/** Ganze Zeile antippbar: öffnet den Wunsch zum Bearbeiten. */
export function WishRow({ wish, reservations, showReservations, onOpen }: {
  wish: Wish;
  reservations: Reservation[];
  showReservations: boolean;
  onOpen: () => void;
}) {
  const taken = reservations.reduce((a, r) => a + r.quantity, 0);
  const status = reservationStatus(wish, reservations);
  const meta = [
    wish.price_cents != null ? formatPrice(wish.price_cents) : "",
    wish.quantity > 1 ? `${wish.quantity} Stück` : "",
    wish.shop ?? "",
  ].filter(Boolean).join(", ");
  return (
    <button type="button" className="wrow-btn" onClick={onOpen} aria-label={`${wish.title} bearbeiten`}>
      <WishTile wish={wish} wrapped={showReservations && taken >= wish.quantity} />
      <span className="wrow-info">
        <span className="wrow-title">{wish.title}</span>
        <span className="wrow-meta"><PriorityBadge priority={wish.priority} />{meta && <span>{meta}</span>}</span>
        {wish.note && <span className="wrow-note">{wish.note}</span>}
        {showReservations && <span className={`status-line ${status.free ? "is-free" : "is-res"}`}>{status.text}</span>}
      </span>
      <span className="wrow-chev" aria-hidden="true"><IconChevron /></span>
    </button>
  );
}

/** Kachel-Ansicht: großes Bild, Name, Preis und Status. Antippen öffnet den Wunsch zum Bearbeiten. */
export function WishCard({ wish, reservations, showReservations, onOpen }: {
  wish: Wish;
  reservations: Reservation[];
  showReservations: boolean;
  onOpen: () => void;
}) {
  const taken = reservations.reduce((a, r) => a + r.quantity, 0);
  const status = reservationStatus(wish, reservations);
  return (
    <button type="button" className="wcard" onClick={onOpen} aria-label={`${wish.title} bearbeiten`}>
      <WishTile wish={wish} wrapped={showReservations && taken >= wish.quantity} />
      <span className="wcard-body">
        <PriorityBadge priority={wish.priority} />
        <span className="wcard-title">{wish.title}</span>
        {wish.price_cents != null && <span className="wcard-price">{formatPrice(wish.price_cents)}{wish.quantity > 1 ? ` × ${wish.quantity}` : ""}</span>}
        {showReservations && <span className={`status-line ${status.free ? "is-free" : "is-res"}`}>{status.text}</span>}
      </span>
    </button>
  );
}
