import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { db } from "../lib/supabase";
import { useAuth } from "../lib/auth";
import { friendlyError, toast, toastError } from "../lib/format";
import { IconBack } from "../components/Icons";
import { SkeletonRows } from "../components/Skeleton";

interface Account {
  id: string;
  display_name: string;
  email: string;
  account_type: "family" | "guest";
  is_admin: boolean;
  lists_owned: number;
}

/** Für Administratoren: alle Konten mit Kontoart, umstellbar. */
export function AccountsPage() {
  const { session, refreshProfile } = useAuth();
  const [items, setItems] = useState<Account[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await db().rpc("list_accounts");
    if (error) return setError(friendlyError(error));
    setItems(data as Account[]);
  }, []);
  useEffect(() => { load(); }, [load]);

  const change = async (a: Account, type: "family" | "guest") => {
    if (a.account_type === type) return;
    setBusyId(a.id);
    const { error } = await db().rpc("set_account_type", { p_user: a.id, p_type: type });
    setBusyId(null);
    if (error) return toastError(friendlyError(error));
    toast(type === "family" ? `${a.display_name} darf jetzt eigene Listen anlegen.` : `${a.display_name} hat jetzt ein Konto zum Schenken.`);
    if (a.id === session?.user.id) refreshProfile();
    load();
  };

  const groups: { title: string; type: "family" | "guest" }[] = [
    { title: "Familie", type: "family" },
    { title: "Zum Schenken", type: "guest" },
  ];

  return (
    <div className="wrap narrow">
      <Link className="back" to="/einstellungen"><IconBack /> Einstellungen</Link>
      <h1>Konten</h1>
      <p className="lead">Familienkonten dürfen eigene Listen anlegen. Konten zum Schenken sehen nur Wunschlisten und reservieren, wie Gäste mit Link.</p>
      {error && <p className="notice error mt-16">{error}</p>}
      {!items && !error && <SkeletonRows count={3} label="Konten werden geladen" />}
      {items && groups.map((g) => {
        const list = items.filter((a) => a.account_type === g.type);
        return (
          <section key={g.type} aria-label={g.title}>
            <h2 className="settings-group mt-22">{g.title} ({list.length})</h2>
            {list.length === 0 && <p className="hint">Niemand.</p>}
            <div className="stack mt-8">
              {list.map((a) => (
                <div className="panel account" key={a.id}>
                  <div className="account-who">
                    <b>{a.display_name}{a.is_admin && <span className="badge ml-8">Administrator</span>}</b>
                    <span className="hint">{a.email}{a.lists_owned > 0 ? `, ${a.lists_owned} eigene ${a.lists_owned === 1 ? "Liste" : "Listen"}` : ""}</span>
                  </div>
                  <div className="view-toggle account-toggle" role="group" aria-label={`Kontoart von ${a.display_name}`}>
                    <button type="button" aria-pressed={a.account_type === "guest"} disabled={busyId === a.id} onClick={() => change(a, "guest")}>Zum Schenken</button>
                    <button type="button" aria-pressed={a.account_type === "family"} disabled={busyId === a.id} onClick={() => change(a, "family")}>Familie</button>
                  </div>
                  {a.account_type === "guest" && a.lists_owned > 0 && (
                    <p className="hint m-0">Bestehende eigene Listen bleiben erhalten und können weiter gepflegt werden, nur neue anlegen geht nicht mehr.</p>
                  )}
                </div>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
