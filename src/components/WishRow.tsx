import { PRIORITIES, type Wish } from "../lib/types";
import { formatPrice, guessEmoji, imageUrl, tintFor } from "../lib/wishes";
import { IconMore } from "./Icons";

export function WishTile({ wish }: { wish: Wish }) {
  const img = imageUrl(wish.image_path);
  return (
    <div className={`tile t${tintFor(wish.id)}`}>
      {img ? <img src={img} alt="" loading="lazy" /> : <span className="emo" aria-hidden="true">{guessEmoji(wish.title)}</span>}
    </div>
  );
}

export function WishRow({ wish, onMenu }: { wish: Wish; onMenu: () => void }) {
  const p = PRIORITIES[wish.priority];
  return (
    <article className="wrow">
      <WishTile wish={wish} />
      <div className="info">
        <h3>{wish.title}</h3>
        <div className="sub">
          <span className={`badge ${p.cls}`}>{p.icon} {p.label}</span>
          {wish.price_cents != null && <span>{formatPrice(wish.price_cents)}</span>}
          {wish.quantity > 1 && <span>{wish.quantity} Stück</span>}
          {wish.shop && <span>{wish.shop}</span>}
        </div>
        {wish.note && <div className="sub">{wish.note}</div>}
      </div>
      <div className="ra">
        <button className="icon-btn" onClick={onMenu} aria-label={`Aktionen für ${wish.title}`}><IconMore /></button>
      </div>
    </article>
  );
}
