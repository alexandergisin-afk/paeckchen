import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { db } from "../lib/supabase";
import { useAuth } from "../lib/auth";
import { computeReview, computeStats, type StatList, type StatRes, type StatWish } from "../lib/stats";
import { friendlyError } from "../lib/format";
import { formatPrice } from "../lib/wishes";
import { IconBack } from "../components/Icons";

/** Große Abfragen in Stücken, damit die Adresse nicht zu lang wird. */
async function inChunks<T>(table: string, cols: string, field: string, ids: string[]): Promise<T[]> {
  const out: T[] = [];
  for (let i = 0; i < ids.length; i += 150) {
    const { data, error } = await db().from(table).select(cols).in(field, ids.slice(i, i + 150));
    if (error) throw error;
    out.push(...(data as unknown as T[]));
  }
  return out;
}

export function StatsPage() {
  const { session } = useAuth();
  const me = session?.user.id ?? "";
  const [data, setData] = useState<{ lists: StatList[]; wishes: StatWish[]; res: StatRes[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [scope, setScope] = useState("all"); // "all" oder die ID einer Liste
  const [withArchived, setWithArchived] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const { data: lists, error } = await db().from("lists").select("id,title,recipient_name,event_date,archived_at,list_members(user_id,show_reservations)").order("event_date", { ascending: false });
        if (error) throw error;
        const ls = lists as StatList[];
        const wishes = await inChunks<StatWish>("wishes", "id,list_id,title,price_cents,quantity,priority,shop,created_at,group_gift", "list_id", ls.map((l) => l.id));
        const res = await inChunks<StatRes>("reservations", "id,wish_id,quantity,amount_cents,guest_name,created_at,parents_buy", "wish_id", wishes.map((w) => w.id));
        setData({ lists: ls, wishes, res });
      } catch (e) {
        setError(friendlyError(e));
      }
    })();
  }, []);

  const scopeIds = useMemo(() => {
    if (!data) return new Set<string>();
    if (scope === "all") return new Set(data.lists.filter((l) => withArchived || !l.archived_at).map((l) => l.id));
    return new Set([scope]);
  }, [data, scope, withArchived]);

  const s = useMemo(() => (data ? computeStats(data.lists, data.wishes, data.res, scopeIds, me) : null), [data, scopeIds, me]);
  // Rückblick: bei einer einzelnen Liste nur für die beschenkte Person dieser Liste
  const picked = data?.lists.find((l) => l.id === scope) ?? null;
  const review = useMemo(() => {
    if (!data) return [];
    const all = computeReview(data.lists, data.wishes, data.res);
    if (!picked) return all;
    const who = (picked.recipient_name?.trim() || "Ohne Namen").toLowerCase();
    return all.filter((g) => g.name.toLowerCase() === who);
  }, [data, picked]);

  if (error) return <div className="wrap narrow"><p className="notice error">{error}</p></div>;
  if (!data || !s) return <p className="loading">Statistik wird berechnet …</p>;

  const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);
  const maxBucket = Math.max(1, ...s.geld.buckets.map((b) => b.count));
  const maxWeek = Math.max(1, ...s.zeit.weeks.map((w) => w.count));
  const maxGiver = Math.max(1, ...s.schenkende.ranking.map((r) => r.items));

  return (
    <div className="wrap narrow">
      <Link className="back" to="/"><IconBack /> Listen</Link>
      <h1>Statistik</h1>
      <div className="stats-picker scroll-x" role="group" aria-label="Liste auswählen">
        <button type="button" className="fchip" aria-pressed={scope === "all"} onClick={() => setScope("all")}>Alle Listen</button>
        {data.lists.filter((l) => !l.archived_at).map((l) => (
          <button key={l.id} type="button" className="fchip" aria-pressed={scope === l.id} onClick={() => setScope(l.id)}>{l.title}</button>
        ))}
        {data.lists.some((l) => l.archived_at) && <span className="picker-sep" aria-hidden="true">Abgeschlossen:</span>}
        {data.lists.filter((l) => l.archived_at).map((l) => (
          <button key={l.id} type="button" className="fchip archived" aria-pressed={scope === l.id} onClick={() => setScope(l.id)}>{l.title}</button>
        ))}
      </div>
      {scope === "all" && data.lists.some((l) => l.archived_at) && (
        <label className="switch stats-archived">
          <input type="checkbox" checked={withArchived} onChange={(e) => setWithArchived(e.target.checked)} />
          <span>Abgeschlossene Listen mitzählen</span>
        </label>
      )}
      {picked && (
        <p className="stats-for">
          <b>{picked.title}</b>
          {[picked.recipient_name ? `für ${picked.recipient_name}` : "", picked.event_date ? new Date(picked.event_date + "T12:00:00").toLocaleDateString("de-DE", { day: "numeric", month: "long", year: "numeric" }) : ""].filter(Boolean).join(", ")}
          {picked.archived_at ? ", abgeschlossen" : ""}
        </p>
      )}
      {s.hiddenLists > 0 && (
        <p className="hint" style={{ marginBottom: 14 }}>
          Bei {s.hiddenLists === 1 ? "einer Liste" : `${s.hiddenLists} Listen`} hast du Reservierungen ausgeblendet. Sie werden hier nicht mitgezählt.
        </p>
      )}

      <div className="stack">
        <section className="panel">
          <h2>Stand</h2>
          <div className="stat-grid">
            <div className="stat-tile">
              <span className="stat-num">{s.stand.taken} <small>von {s.stand.total}</small></span>
              <span className="stat-label">Wünsche vergeben</span>
              <span className="progress big" aria-hidden="true"><span style={{ width: `${pct(s.stand.taken, s.stand.total)}%` }} /></span>
            </div>
            <div className="stat-tile heart">
              <span className="stat-num">{s.stand.heartsDone} <small>von {s.stand.hearts}</small></span>
              <span className="stat-label">Herzenswünschen erfüllt</span>
              <span className="progress big" aria-hidden="true"><span style={{ width: `${pct(s.stand.heartsDone, s.stand.hearts)}%` }} /></span>
            </div>
          </div>
          {s.stand.next && <p className="stat-foot">Als Nächstes: <b>{s.stand.next.title}</b> {s.stand.next.days === 0 ? "heute" : s.stand.next.days === 1 ? "morgen" : `in ${s.stand.next.days} Tagen`}</p>}
        </section>

        <section className="panel">
          <h2>Geld</h2>
          <div className="stat-grid">
            <div className="stat-tile"><span className="stat-num">{formatPrice(s.geld.totalValue)}</span><span className="stat-label">Wert aller Wünsche</span></div>
            <div className="stat-tile"><span className="stat-num">{formatPrice(s.geld.reservedValue)}</span><span className="stat-label">davon reserviert</span></div>
            <div className="stat-tile"><span className="stat-num">{s.geld.avgPrice != null ? formatPrice(s.geld.avgPrice) : "–"}</span><span className="stat-label">durchschnittlicher Preis</span></div>
          </div>
          {s.geld.parentsBuy.items > 0 && (
            <p className="notice" style={{ marginTop: 12 }}>
              <b>Von euch zu besorgen:</b> {s.geld.parentsBuy.items} {s.geld.parentsBuy.items === 1 ? "Geschenk" : "Geschenke"}
              {s.geld.parentsBuy.value > 0 && <> im Wert von {formatPrice(s.geld.parentsBuy.value)}</>}. Das Geld bekommt ihr von den Schenkenden.
            </p>
          )}
          <h3 className="stat-sub">Wünsche nach Preis</h3>
          <div className="hbars">
            {s.geld.buckets.map((b) => (
              <div className="hbar" key={b.label}>
                <span className="hbar-label">{b.label}</span>
                <span className="hbar-track"><span style={{ width: `${(b.count / maxBucket) * 100}%` }} /></span>
                <span className="hbar-val">{b.count}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="panel">
          <h2>Schenkende</h2>
          {s.schenkende.distinct === 0 ? <p className="hint" style={{ marginTop: 6 }}>Noch hat niemand reserviert.</p> : (
            <>
              <p className="stat-foot" style={{ marginTop: 6 }}><b>{s.schenkende.distinct}</b> {s.schenkende.distinct === 1 ? "Person hat" : "Personen haben"} reserviert. Praktisch für die Dankeskarten:</p>
              <div className="hbars">
                {s.schenkende.ranking.map((r) => (
                  <div className="hbar giver" key={r.name}>
                    <span className="hbar-label">{r.name}</span>
                    <span className="hbar-track"><span style={{ width: `${(r.items / maxGiver) * 100}%` }} /></span>
                    <span className="hbar-val">{r.items}{r.value > 0 && <small> {formatPrice(r.value)}</small>}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </section>

        <section className="panel">
          <h2>Zeitverlauf</h2>
          {!s.zeit.hasDates ? <p className="hint" style={{ marginTop: 6 }}>Sobald reserviert wird und die Liste ein Datum hat, siehst du hier, wann die Gäste aktiv werden.</p> : (
            <>
              <p className="hint" style={{ margin: "6px 0 12px" }}>Reservierungen nach Wochen vor dem Anlass</p>
              <div className="vbars" role="img" aria-label={s.zeit.weeks.slice(0, 9).map((w) => `${w.label}: ${w.count}`).join(", ")}>
                {s.zeit.weeks.slice(0, 9).map((w) => (
                  <div className="vbar" key={w.label}>
                    <span className="vbar-val">{w.count || ""}</span>
                    <span className="vbar-col"><span style={{ height: `${(w.count / maxWeek) * 100}%` }} /></span>
                    <span className="vbar-label">{w.label.replace(" Wochen", "").replace(" Wo.", "").replace("letzte Woche", "0")}</span>
                  </div>
                ))}
              </div>
              <p className="hint" style={{ marginTop: 6 }}>Zahlen = Wochen vor dem Anlass, 0 = letzte Woche{s.zeit.weeks[9].count > 0 ? `. Nach dem Anlass reserviert: ${s.zeit.weeks[9].count}` : ""}</p>
            </>
          )}
          {s.zeit.avgDaysToReserve != null && (
            <p className="stat-foot">Vom Eintragen bis zur Reservierung vergehen im Schnitt <b>{Math.round(s.zeit.avgDaysToReserve)} {Math.round(s.zeit.avgDaysToReserve) === 1 ? "Tag" : "Tage"}</b>.</p>
          )}
        </section>

        <section className="panel">
          <h2>Rückblick</h2>
          <p className="hint" style={{ margin: "6px 0 12px" }}>{picked ? `${picked.recipient_name?.trim() || "Diese Person"} über alle Listen und Jahre` : "Pro beschenkter Person über alle Listen und Jahre"}</p>
          {review.length === 0 ? <p className="hint">Noch keine Listen.</p> : (
            <div className="review">
              {review.map((g) => (
                <div className="review-card" key={g.name}>
                  <span className="avatar" aria-hidden="true">{g.name.charAt(0).toUpperCase()}</span>
                  <div>
                    <b>{g.name}</b>
                    <span className="hint" style={{ display: "block" }}>
                      {g.lists} {g.lists === 1 ? "Liste" : "Listen"}{g.years.length ? ` (${g.years.join(", ")})` : ""}, {g.wishes} {g.wishes === 1 ? "Wunsch" : "Wünsche"}, davon {g.fulfilled} erfüllt
                    </span>
                    {g.topShops.length > 0 && <span className="hint" style={{ display: "block" }}>Lieblingsshops: {g.topShops.join(", ")}</span>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
