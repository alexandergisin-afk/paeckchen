import { useEffect, useState } from "react";
import { PRIORITIES, type Reservation, type Wish } from "../lib/types";
import { formatPrice, guessEmoji, imageUrl, tintFor } from "../lib/wishes";
import { Bow, IconMore } from "./Icons";

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

export function WishRow({ wish, reservations, showReservations, onMenu }: {
  wish: Wish;
  reservations: Reservation[];
  showReservations: boolean;
  onMenu: () => void;
}) {
  const taken = reservations.reduce((a, r) => a + r.quantity, 0);
  const free = wish.quantity - taken;
  return (
    <article className="wrow">
      <WishTile wish={wish} wrapped={showReservations && free <= 0} />
      <div className="info">
        <h3>{wish.title}</h3>
        <div className="sub">
          <PriorityBadge priority={wish.priority} />
          {wish.price_cents != null && <span>{formatPrice(wish.price_cents)}</span>}
          {wish.quantity > 1 && <span>{wish.quantity} Stück</span>}
          {wish.shop && <span>{wish.shop}</span>}
        </div>
        {wish.note && <div className="sub">{wish.note}</div>}
        {showReservations && (
          <div className="sub">
            {reservations.map((r) => (
              <span key={r.id} className="badge st-res">Reserviert von {r.guest_name}{r.quantity > 1 ? ` (${r.quantity})` : ""}</span>
            ))}
            {free > 0 && <span className="badge">{reservations.length ? `noch ${free} frei` : "Noch frei"}</span>}
          </div>
        )}
      </div>
      <div className="ra">
        <button className="icon-btn" onClick={onMenu} aria-label={`Aktionen für ${wish.title}`}><IconMore /></button>
      </div>
    </article>
  );
}
