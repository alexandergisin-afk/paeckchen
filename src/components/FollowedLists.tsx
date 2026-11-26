import { useEffect, useState } from "react";
import { useAuth } from "../lib/auth";
import { friendlyError, toast, toastError, short } from "../lib/format";
import { cachedFollowed, loadFollowed, syncDeviceToAccount, unfollow, type FollowedList } from "../lib/followed";
import { RemovableListRow } from "./ListRow";

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
      toast(`„${short(l.title)}“ ist nicht mehr in deiner Übersicht.`);
    } catch (e) {
      toastError(friendlyError(e));
    }
  };

  return (
    <section className="guest-account" aria-label="Wunschlisten zum Schenken">
      <h2 className="section-title">Wunschlisten zum Schenken</h2>
      {lists && lists.length === 0 && (
        <p className="hint">Hier erscheinen Wunschlisten, die du über einen Link öffnest oder die dir jemand freigibt.</p>
      )}
      <div className="list-rows">
        {(lists ?? []).map((l) => (
          <RemovableListRow key={l.list_id} to={`/w/${l.guest_token}`} list={l}
            removeLabel={`„${short(l.title)}“ aus deiner Übersicht entfernen`} onRemove={() => remove(l)} />
        ))}
      </div>
    </section>
  );
}
