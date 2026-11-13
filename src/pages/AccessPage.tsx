import { useCallback, useEffect, useState } from "react";
import { SkeletonRows } from "../components/Skeleton";
import { Link } from "react-router-dom";
import { db } from "../lib/supabase";
import { useAuth } from "../lib/auth";
import { cover, type Role } from "../lib/types";
import { friendlyError, toast } from "../lib/format";
import { IconBack } from "../components/Icons";
import { Sheet } from "../components/Sheet";

interface Member { user_id: string; role: Role; profiles: { display_name: string } | null }
interface AccessList { id: string; title: string; cover: number; list_members: Member[] }
interface Person { id: string; name: string }
type Confirm = null | { kind: "removeLast"; person: Person; list: AccessList } | { kind: "leave"; list: AccessList };

/** Zentrale Übersicht: Wer hat Zugriff auf welche meiner Listen? Und welche Listen teilen andere mit mir? */
export function AccessPage() {
  const { session } = useAuth();
  const me = session?.user.id ?? "";
  const [lists, setLists] = useState<AccessList[] | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<Confirm>(null);

  const load = useCallback(async () => {
    const { data, error } = await db().from("lists").select("id,title,cover,list_members(user_id,role,profiles(display_name))").order("created_at", { ascending: false });
    if (error) return toast(friendlyError(error));
    setLists(data as unknown as AccessList[]);
  }, []);
  useEffect(() => { load(); }, [load]);

  if (!lists) return <div className="wrap narrow"><SkeletonRows count={2} /></div>;

  const roleIn = (l: AccessList, uid: string) => l.list_members.find((m) => m.user_id === uid)?.role;
  const owned = lists.filter((l) => roleIn(l, me) === "owner");
  const shared = lists.filter((l) => roleIn(l, me) === "editor");

  // Alle Personen außer mir, die irgendwo mit mir eine Liste teilen
  const people = new Map<string, Person>();
  for (const l of lists) for (const m of l.list_members) {
    if (m.user_id !== me && !people.has(m.user_id)) people.set(m.user_id, { id: m.user_id, name: m.profiles?.display_name ?? "Unbekannt" });
  }
  const sharedCount = (p: Person) => lists.filter((l) => roleIn(l, p.id)).length;

  const add = async (p: Person, l: AccessList) => {
    setBusyKey(`${p.id}:${l.id}`);
    const { error } = await db().rpc("add_member", { p_list: l.id, p_user: p.id });
    setBusyKey(null);
    if (error) return toast(friendlyError(error));
    toast(`${p.name} kann jetzt „${l.title}“ mitbearbeiten.`);
    load();
  };

  const remove = async (p: Person, l: AccessList) => {
    setBusyKey(`${p.id}:${l.id}`);
    const { error } = await db().from("list_members").delete().eq("list_id", l.id).eq("user_id", p.id);
    setBusyKey(null);
    setConfirm(null);
    if (error) return toast(friendlyError(error));
    toast(`${p.name} hat keinen Zugriff mehr auf „${l.title}“.`);
    load();
  };

  const toggle = (p: Person, l: AccessList, on: boolean) => {
    if (on) return add(p, l);
    // Letzte gemeinsame Liste: danach taucht die Person hier nicht mehr auf und bräuchte eine neue Einladung.
    if (sharedCount(p) <= 1) return setConfirm({ kind: "removeLast", person: p, list: l });
    remove(p, l);
  };

  const leave = async (l: AccessList) => {
    const { error } = await db().from("list_members").delete().eq("list_id", l.id).eq("user_id", me);
    setConfirm(null);
    if (error) return toast(friendlyError(error));
    toast(`Du hast „${l.title}“ verlassen.`);
    load();
  };

  return (
    <div className="wrap narrow">
      <Link className="back" to="/einstellungen"><IconBack /> Einstellungen</Link>
      <h1>Zugriff verwalten</h1>
      <p className="lead">Wer welche deiner Listen mitbearbeiten darf. Neue Personen lädst du in einer Liste unter „Mitglieder“ ein.</p>
      <RolesTable />

      <div className="stack" style={{ marginTop: 22 }}>
        {owned.length === 0 && <section className="panel"><p className="hint">Du hast noch keine eigene Liste.</p></section>}

        {owned.length > 0 && people.size === 0 && (
          <section className="panel">
            <h2>Noch niemand eingeladen</h2>
            <p className="hint" style={{ marginTop: 6 }}>Öffne eine Liste und tippe auf „Mitglieder“, um jemanden zum Mitbearbeiten einzuladen. Danach kannst du die Person hier mit einem Tipp auch zu deinen anderen Listen hinzufügen.</p>
          </section>
        )}

        {owned.length > 0 && [...people.values()].map((p) => (
          <section className="panel person" key={p.id}>
            <div className="member" style={{ borderBottom: 0, paddingTop: 0 }}>
              <span className="avatar" aria-hidden="true">{p.name.charAt(0).toUpperCase()}</span>
              <div className="who"><b>{p.name}</b><div className="hint">Mitbearbeiter bei {owned.filter((l) => roleIn(l, p.id)).length} von {owned.length} deiner Listen</div></div>
            </div>
            <ul className="access-list" aria-label={`Listen von ${p.name}`}>
              {owned.map((l) => {
                const has = !!roleIn(l, p.id);
                const c = cover(l.cover);
                return (
                  <li key={l.id}>
                    <label className="access-row">
                      <span className={`access-cover t${c.t}`} aria-hidden="true">{c.e}</span>
                      <span className="access-title">{l.title}<span className={`role-tag ${has ? "on" : ""}`}>{has ? "Mitbearbeiter" : "Kein Zugriff"}</span></span>
                      <span className="mini-switch">
                        <input type="checkbox" role="switch" checked={has} disabled={busyKey === `${p.id}:${l.id}`}
                          onChange={(e) => toggle(p, l, e.target.checked)} aria-label={`${p.name} darf „${l.title}“ mitbearbeiten`} />
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}

        {shared.length > 0 && (
          <section className="panel">
            <h2>Listen, die andere mit dir teilen</h2>
            <ul className="access-list" style={{ marginTop: 8 }}>
              {shared.map((l) => {
                const owner = l.list_members.find((m) => m.role === "owner")?.profiles?.display_name ?? "jemand anderem";
                const c = cover(l.cover);
                return (
                  <li key={l.id} className="access-row">
                    <span className={`access-cover t${c.t}`} aria-hidden="true">{c.e}</span>
                    <span className="access-title">{l.title}<span className="hint" style={{ display: "block" }}>Besitzer: {owner}, deine Rolle: Mitbearbeiter</span></span>
                    <button className="btn quiet small" onClick={() => setConfirm({ kind: "leave", list: l })}>Verlassen</button>
                  </li>
                );
              })}
            </ul>
          </section>
        )}
      </div>

      <Sheet open={confirm?.kind === "removeLast"} onClose={() => setConfirm(null)} label="Zugriff entziehen">
        {confirm?.kind === "removeLast" && (
          <>
            <h2>{confirm.person.name} ganz entfernen?</h2>
            <p>Das ist die letzte Liste, die ihr gemeinsam habt. Danach erscheint {confirm.person.name} hier nicht mehr. Um später wieder zusammenzuarbeiten, brauchst du eine neue Einladung.</p>
            <div className="toolbar" style={{ marginTop: 18 }}>
              <button className="btn danger" onClick={() => remove(confirm.person, confirm.list)}>Zugriff entziehen</button>
              <button className="btn soft" onClick={() => setConfirm(null)}>Abbrechen</button>
            </div>
          </>
        )}
      </Sheet>

      <Sheet open={confirm?.kind === "leave"} onClose={() => setConfirm(null)} label="Liste verlassen">
        {confirm?.kind === "leave" && (
          <>
            <h2>„{confirm.list.title}“ verlassen?</h2>
            <p>Du kannst die Liste danach nicht mehr sehen oder bearbeiten. Um wieder dabei zu sein, brauchst du eine neue Einladung.</p>
            <div className="toolbar" style={{ marginTop: 18 }}>
              <button className="btn danger" onClick={() => leave(confirm.list)}>Verlassen</button>
              <button className="btn soft" onClick={() => setConfirm(null)}>Abbrechen</button>
            </div>
          </>
        )}
      </Sheet>
    </div>
  );
}

/** Übersicht, was Besitzer, Mitbearbeiter und Gäste jeweils dürfen (entspricht den Regeln der Datenbank). */
function RolesTable() {
  const rows: [string, boolean, boolean, boolean | string][] = [
    ["Liste und Wünsche ansehen", true, true, "ohne Namen"],
    ["Reservieren und mitschenken", true, true, true],
    ["Wünsche hinzufügen, bearbeiten, löschen", true, true, false],
    ["Liste bearbeiten, abschließen, wiederverwenden", true, true, false],
    ["Sehen, wer was reserviert hat", true, true, false],
    ["Reservierungen freigeben", true, true, false],
    ["Mitbearbeiter einladen und entfernen", true, false, false],
    ["Gast-Link erneuern", true, false, false],
    ["Liste löschen", true, false, false],
  ];
  const cell = (v: boolean | string) =>
    typeof v === "string" ? <span className="perm-note">{v}</span> : v ? <span className="perm-yes" aria-label="ja">✓</span> : <span className="perm-no" aria-label="nein">–</span>;
  return (
    <details className="panel roles" style={{ marginTop: 18 }}>
      <summary><b>Wer darf was?</b> <span className="hint">Besitzer, Mitbearbeiter und Gäste</span></summary>
      <div className="table-scroll">
        <table className="perm-table">
          <thead><tr><th scope="col">Aktion</th><th scope="col">Besitzer</th><th scope="col">Mit­bearbeiter</th><th scope="col">Gäste</th></tr></thead>
          <tbody>{rows.map(([label, o, e, g]) => <tr key={label}><th scope="row">{label}</th><td>{cell(o)}</td><td>{cell(e)}</td><td>{cell(g)}</td></tr>)}</tbody>
        </table>
      </div>
      <p className="hint" style={{ marginTop: 10 }}>
        <b>Besitzer</b> ist, wer die Liste angelegt hat. <b>Mitbearbeiter</b> kommen über eine Einladung dazu. <b>Gäste</b> brauchen kein Konto, nur den Gast-Link.
        Reservierungen sieht jeder nur, solange der eigene Schalter „Anzeigen“ an ist. Mitbearbeiter können eine Liste jederzeit selbst verlassen.
      </p>
    </details>
  );
}
