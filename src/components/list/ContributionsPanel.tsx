// Gruppengeschenk aus Elternsicht: wer sich mit wie viel beteiligt
import { type Reservation, type Wish } from "../../lib/types";
import { euroShort, giftFunded, giftTarget } from "../../lib/gift";
import { IconGift } from "../../components/Icons";

/** Gruppengeschenk aus Elternsicht: wer sich mit wie viel beteiligt, was noch fehlt. */
export function ContributionsPanel({ wish, contributions, busy, onRelease, onAdd, onTakeRest }: {
  wish: Wish; contributions: Reservation[]; busy: boolean;
  onRelease: (r: Reservation) => void; onAdd: () => void; onTakeRest: (open: number) => void;
}) {
  // Ganz übernommen: keine Beiträge, sondern eine Person besorgt es selbst
  const self = contributions.find((r) => r.amount_cents == null && r.quantity > 0);
  if (self) {
    return (
      <section className="contrib-panel" aria-label="Beiträge zum Gruppengeschenk">
        <h3>Gemeinsames Geschenk</h3>
        <ul className="contrib-list">
          <li>
            <span className="contrib-name">{self.guest_name}<small> übernimmt es ganz und besorgt es selbst</small></span>
            <b className="contrib-amount">{euroShort(giftTarget(wish))}</b>
            <button type="button" className="btn quiet small" onClick={() => onRelease(self)} aria-label={`Reservierung von ${self.guest_name} aufheben`}>Aufheben</button>
          </li>
        </ul>
      </section>
    );
  }
  const target = giftTarget(wish);
  const funded = giftFunded(contributions);
  const open = Math.max(0, target - funded);
  const pct = target ? Math.min(100, Math.round((funded / target) * 100)) : 0;
  const sorted = [...contributions].sort((a, b) => (b.amount_cents ?? 0) - (a.amount_cents ?? 0));
  return (
    <section className="contrib-panel" aria-label="Beiträge zum Gruppengeschenk">
      <h3>Gemeinsames Geschenk</h3>
      <div className="gift-sum">
        <span><b>{euroShort(funded)}</b> von {euroShort(target)}</span>
        <small>{open > 0 ? `es fehlen noch ${euroShort(open)}` : "komplett"}</small>
      </div>
      <span className="progress big" aria-hidden="true"><span style={{ width: `${pct}%` }} /></span>
      {sorted.length === 0 ? (
        <p className="hint" style={{ margin: "10px 0 0" }}>Noch hat niemand etwas beigesteuert.</p>
      ) : (
        <ul className="contrib-list">
          {sorted.map((r) => (
            <li key={r.id}>
              <span className="contrib-name">{r.guest_name}{r.entered_by && <small> von euch eingetragen</small>}</span>
              <b className="contrib-amount">{euroShort(r.amount_cents ?? 0)}</b>
              <button type="button" className="btn quiet small" onClick={() => onRelease(r)} aria-label={`Beitrag von ${r.guest_name} (${euroShort(r.amount_cents ?? 0)}) aufheben`}>Aufheben</button>
            </li>
          ))}
        </ul>
      )}
      {open > 0 && (
        <div className="contrib-actions">
          <button type="button" className="btn soft small" onClick={onAdd}><IconGift /> Beitrag eintragen</button>
          {sorted.length > 0 && <button type="button" className="btn soft small" disabled={busy} onClick={() => onTakeRest(open)}>Rest übernehmen ({euroShort(open)})</button>}
        </div>
      )}
    </section>
  );
}
