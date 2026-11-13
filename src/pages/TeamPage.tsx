import { useCallback, useEffect, useState, type FormEvent } from "react";
import { SkeletonRows } from "../components/Skeleton";
import { Link, useParams } from "react-router-dom";
import { db, guestLink, inviteLink } from "../lib/supabase";
import { useAuth } from "../lib/auth";
import { LIST_SELECT, type Role, type WishList } from "../lib/types";
import { friendlyError, toast } from "../lib/format";
import { IconBack, IconChat, IconMail, IconRefresh, IconUsers } from "../components/Icons";
import { Sheet } from "../components/Sheet";

interface Member { user_id: string; role: Role; profiles: { display_name: string } | null }
interface Invite { id: string; expires_at: string; revoked_at: string | null; used_at: string | null }
type TSheet = null | { kind: "invite" } | { kind: "remove"; member: Member } | { kind: "renew" };

const ROLE_LABEL: Record<Role, string> = { owner: "Besitzer", editor: "Mitbearbeiter" };

function CopyButton({ text, label = "Kopieren" }: { text: string; label?: string }) {
  const [state, setState] = useState<null | "ok" | "fail">(null);
  return (
    <button className="btn small" onClick={async () => {
      try { await navigator.clipboard.writeText(text); setState("ok"); } catch { setState("fail"); }
      window.setTimeout(() => setState(null), 2000);
    }}>{state === "ok" ? "Kopiert ✓" : state === "fail" ? "Bitte markieren" : label}</button>
  );
}

export function TeamPage() {
  const { id } = useParams();
  const { session } = useAuth();
  const [list, setList] = useState<WishList | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [state, setState] = useState<"loading" | "ok" | "missing">("loading");
  const [sheet, setSheet] = useState<TSheet>(null);
  const [busy, setBusy] = useState(false);
  const close = () => setSheet(null);

  const load = useCallback(async () => {
    const [l, m, i] = await Promise.all([
      db().from("lists").select(LIST_SELECT).eq("id", id).maybeSingle(),
      db().from("list_members").select("user_id,role,profiles(display_name)").eq("list_id", id),
      db().from("invites").select("id,expires_at,revoked_at,used_at").eq("list_id", id),
    ]);
    if (l.error || !l.data) return setState("missing");
    setList(l.data as WishList);
    setMembers(((m.data ?? []) as unknown as Member[]).sort((a, b) => (a.role === "owner" ? -1 : b.role === "owner" ? 1 : 0)));
    setInvites((i.data ?? []) as Invite[]);
    setState("ok");
  }, [id]);

  useEffect(() => { load(); }, [load]);

  if (state === "loading") return <div className="wrap narrow"><SkeletonRows count={2} /></div>;
  if (state === "missing" || !list)
    return (
      <div className="wrap narrow">
        <h1>Diese Liste gibt es nicht oder du hast keinen Zugriff.</h1>
        <p style={{ marginTop: 16 }}><Link className="btn soft" to="/">Zu meinen Listen</Link></p>
      </div>
    );

  const isOwner = members.some((m) => m.user_id === session?.user.id && m.role === "owner");
  const ownerName = members.find((m) => m.role === "owner")?.profiles?.display_name ?? "der Besitzer";
  const now = Date.now();
  const pending = invites.filter((i) => !i.used_at && !i.revoked_at && new Date(i.expires_at).getTime() > now);

  const remove = async (m: Member) => {
    setBusy(true);
    const { error } = await db().from("list_members").delete().eq("list_id", list.id).eq("user_id", m.user_id);
    setBusy(false);
    if (error) return toast(friendlyError(error));
    close(); toast("Zugriff entzogen."); load();
  };

  const revoke = async (inv: Invite) => {
    const { error } = await db().from("invites").update({ revoked_at: new Date().toISOString() }).eq("id", inv.id);
    if (error) return toast(friendlyError(error));
    toast("Einladung zurückgezogen."); load();
  };

  const renew = async () => {
    setBusy(true);
    const { error } = await db().rpc("rotate_guest_link", { p_list: list.id });
    setBusy(false);
    if (error) return toast(friendlyError(error));
    close(); toast("Neuer Link erstellt. Der alte funktioniert nicht mehr."); load();
  };

  return (
    <div className="wrap narrow">
      <Link className="back" to={`/liste/${list.id}`}><IconBack /> {list.title}</Link>
      <h1>Mitglieder</h1>
      <p className="lead">Wer „{list.title}“ mitpflegt und wie Schenkende die Liste öffnen.</p>
      <div className="stack" style={{ marginTop: 22 }}>
        <section className="panel">
          <h2>Personen mit Zugang</h2>
          {members.map((m) => {
            const name = m.profiles?.display_name ?? "Unbekannt";
            return (
              <div className="member" key={m.user_id}>
                <span className="avatar" aria-hidden="true">{name.charAt(0).toUpperCase()}</span>
                <div className="who"><b>{name}{m.user_id === session?.user.id ? " (du)" : ""}</b><div className="hint">{ROLE_LABEL[m.role]}</div></div>
                {isOwner && m.role !== "owner" && <button className="btn quiet" onClick={() => setSheet({ kind: "remove", member: m })}>Entfernen</button>}
              </div>
            );
          })}
          {isOwner ? (
            <>
              <div style={{ marginTop: 14 }}>
                <button className="btn" onClick={() => setSheet({ kind: "invite" })}><IconUsers /> Zum Mitbearbeiten einladen</button>
              </div>
              {pending.length > 0 && (
                <>
                  <h3 style={{ marginTop: 18 }}>Offene Einladungen</h3>
                  {pending.map((i) => (
                    <div className="member" key={i.id}>
                      <div className="who"><b>Einladung als Mitbearbeiter</b><div className="hint">gültig bis {new Date(i.expires_at).toLocaleDateString("de-DE")}</div></div>
                      <button className="btn quiet" onClick={() => revoke(i)}>Zurückziehen</button>
                    </div>
                  ))}
                </>
              )}
            </>
          ) : (
            <p className="hint" style={{ marginTop: 12 }}>Nur {ownerName} kann weitere Personen einladen oder entfernen.</p>
          )}
        </section>

        <section className="panel">
          <h2>Link für Schenkende</h2>
          <p className="hint" style={{ marginTop: 6 }}>Damit kann man Wünsche ansehen und reservieren, aber nichts bearbeiten.</p>
          <div className="linkbox"><code>{guestLink(list.guest_token)}</code><CopyButton text={guestLink(list.guest_token)} /></div>
          <div className="toolbar">
            <Link className="btn soft small" to={`/w/${list.guest_token}`}>Als Gast ansehen</Link>
            {isOwner && <button className="btn line small" onClick={() => setSheet({ kind: "renew" })}><IconRefresh /> Link erneuern</button>}
          </div>
        </section>

        <section className="panel roles">
          <h2>Wer darf was?</h2>
          <div><b>Besitzer</b><span className="hint">Alles, auch einladen, Zugang entziehen, Gast-Link erneuern und die Liste löschen.</span></div>
          <div><b>Mitbearbeiter</b><span className="hint">Wünsche hinzufügen, bearbeiten, löschen, die Liste teilen und Reservierungen freigeben.</span></div>
          <div><b>Gäste</b><span className="hint">Brauchen kein Konto. Sehen die Wünsche und reservieren. Die Namen anderer Schenkender sehen sie nie.</span></div>
        </section>
      </div>

      <Sheet open={sheet?.kind === "invite"} onClose={close} label="Einladen">
        {sheet?.kind === "invite" && <InviteFlow listId={list.id} listTitle={list.title} onDone={load} />}
      </Sheet>

      <Sheet open={sheet?.kind === "remove"} onClose={close} label="Mitglied entfernen">
        {sheet?.kind === "remove" && (
          <>
            <h2>{sheet.member.profiles?.display_name ?? "Diese Person"} entfernen?</h2>
            <p>Die Person verliert sofort den Zugriff auf „{list.title}“. Ihre Wünsche bleiben auf der Liste.</p>
            <div className="toolbar" style={{ marginTop: 18 }}>
              <button className="btn danger" disabled={busy} onClick={() => remove(sheet.member)}>Zugriff entziehen</button>
              <button className="btn soft" onClick={close}>Abbrechen</button>
            </div>
          </>
        )}
      </Sheet>

      <Sheet open={sheet?.kind === "renew"} onClose={close} label="Gast-Link erneuern">
        <h2>Gast-Link erneuern?</h2>
        <p>Der alte Link funktioniert danach nicht mehr. Bereits gemachte Reservierungen bleiben erhalten. Den neuen Link musst du noch einmal verschicken.</p>
        <div className="toolbar" style={{ marginTop: 18 }}>
          <button className="btn" disabled={busy} onClick={renew}>Neuen Link erstellen</button>
          <button className="btn soft" onClick={close}>Abbrechen</button>
        </div>
      </Sheet>
    </div>
  );
}

function InviteFlow({ listId, listTitle, onDone }: { listId: string; listTitle: string; onDone: () => void }) {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [link, setLink] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    // Administratoren schalten direkt frei; sonst entsteht eine Anfrage an die Verwaltung
    const a = await db().functions.invoke("zugang", { body: { action: "invite", email: email.trim(), list_id: listId } });
    const res = a.data as { status?: string; error?: string } | null;
    if (a.error || !res?.status) {
      setBusy(false);
      let code = res?.error;
      try { code = code ?? (await (a.error as { context?: Response }).context?.json())?.error; } catch { /* egal */ }
      return toast(code === "invalid_email" ? "Diese E-Mail-Adresse sieht nicht richtig aus." : code === "forbidden" ? "Dafür fehlt dir die Berechtigung." : "Die Einladung hat gerade nicht geklappt. Bitte versuch es noch einmal.");
    }
    setPending(res.status === "pending");
    const { data, error } = await db().rpc("create_invite", { p_list: listId });
    setBusy(false);
    if (error) return toast(friendlyError(error));
    setLink(inviteLink(data as string));
    onDone();
  };

  if (link) {
    const text = `Hallo! Ich lade dich ein, die Wunschliste „${listTitle}“ bei Päckli mit mir zu pflegen. Öffne diesen Link und melde dich mit ${email.trim()} an: ${link}`;
    return (
      <>
        <h2>Einladung ist fertig</h2>
        <p>Schick den Link an <b>{email.trim()}</b>. Er funktioniert einmal und 7 Tage lang. Angemeldet wird mit genau dieser E-Mail-Adresse.</p>
        {pending && (
          <p className="notice" style={{ marginTop: 12 }}>
            <b>Wartet auf Freigabe:</b> Die Verwaltung muss {email.trim()} noch freigeben und wurde per Mail informiert. Danach bekommt {email.trim()} eine Mail mit dem Anmeldecode, und der Link funktioniert.
          </p>
        )}
        <div className="linkbox"><code>{link}</code><CopyButton text={link} /></div>
        <div className="sharegrid">
          <a className="btn soft" href={`https://wa.me/?text=${encodeURIComponent(text)}`} target="_blank" rel="noopener noreferrer"><IconChat /> WhatsApp</a>
          <a className="btn soft" href={`mailto:${encodeURIComponent(email.trim())}?subject=${encodeURIComponent("Einladung: " + listTitle)}&body=${encodeURIComponent(text)}`}><IconMail /> E-Mail</a>
        </div>
        <p className="hint">Der Link wird aus Sicherheitsgründen nur jetzt angezeigt. Geht er verloren, erstellst du einfach eine neue Einladung.</p>
      </>
    );
  }

  return (
    <>
      <h2>Zum Mitbearbeiten einladen</h2>
      <p>Die eingeladene Person kann Wünsche hinzufügen, bearbeiten und die Liste teilen. Löschen kann sie die Liste nicht.</p>
      <form onSubmit={submit} style={{ marginTop: 16 }}>
        <label className="field">
          <span>E-Mail-Adresse der Person</span>
          <input type="email" required autoFocus autoComplete="off" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@beispiel.de" />
          <small>Damit schalten wir die Adresse für die Anmeldung frei.</small>
        </label>
        <button className="btn block" type="submit" disabled={busy}>{busy ? "Wird erstellt …" : "Einladungslink erstellen"}</button>
      </form>
    </>
  );
}
