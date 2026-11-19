import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { cover } from "../lib/types";
import { dateLabel, daysChip, friendlyError, toast } from "../lib/format";
import { cachedFollowed, loadFollowed, syncDeviceToAccount, unfollow, type FollowedList } from "../lib/followed";
import { IconChevron } from "./Icons";

/**
 * Wunschlisten zum Schenken, am Konto gespeichert (auf jedem Gerät gleich).
 * always: auch ohne Einträge anzeigen (für Konten zum Schenken), sonst nur wenn es welche gibt.
 */
export function FollowedLists({ always }: { always: boolean }) {
  const { session } = useAuth();
  const [lists, setLists] = useState<FollowedList[] | undefined>(cachedFollowed);

  useEffect(() => {
    if (!session) return;
    let alive = true;
    (async () => {
      try {
        await syncDeviceToAccount(session.user.id); // einmalig: vorher auf dem Gerät Geöffnetes übernehmen
        const l = await loadFollowed();
        if (alive) setLists(l);
      } catch { /* ohne Netz: zuletzt Geladenes bleibt stehen */ }
    })();
    return () => { alive = false; };
  }, [session]);

  if (!always && !lists?.length) return null;

  const remove = async (l: FollowedList) => {
    try {
      await unfollow(l, session!.user.id);
      setLists((cur) => cur?.filter((x) => x.list_id !== l.list_id));
      toast(`„${l.title}“ ist nicht mehr in deiner Übersicht.`);
    } catch (e) {
      toast(friendlyError(e));
    }
  };

  return (
    <section className="guest-account" aria-label="Wunschlisten zum Schenken">
      <h2 className="section-title">Wunschlisten zum Schenken</h2>
      {lists && lists.length === 0 && (
        <p className="hint">Hier erscheinen Wunschlisten, die du über einen Link öffnest oder die dir jemand freigibt.</p>
      )}
      <div className="list-rows">
        {(lists ?? []).map((l) => {
          const c = cover(l.cover);
          const d = daysChip(l.event_date);
          return (
            <div className="guest-home-row" key={l.list_id}>
              <Link className="list-row" to={`/w/${l.guest_token}`}>
                <span className={`list-cover t${c.t}`} aria-hidden="true">{c.e}</span>
                <span className="list-text">
                  <span className="list-title">{l.title}</span>
                  <span className="list-meta">
                    {[l.recipient_name ? `Für ${l.recipient_name}` : "", dateLabel(l.event_date)].filter(Boolean).join(", ")}
                    {d && <span className={`days-chip ${d.soon ? "soon" : ""}`}>{d.text}</span>}
                  </span>
                </span>
                <span className="list-chev" aria-hidden="true"><IconChevron /></span>
              </Link>
              <button type="button" className="guest-home-x" aria-label={`„${l.title}“ aus deiner Übersicht entfernen`} onClick={() => remove(l)}>×</button>
            </div>
          );
        })}
      </div>
    </section>
  );
}
