// Liste wiederverwenden: welche Wünsche in die neue Liste übernommen werden
import { useState } from "react";
import { type WishList } from "../../lib/types";

export function ReuseForm({ list, showRes, onSubmit }: {
  list: WishList;
  showRes: boolean;
  onSubmit: (v: { title: string; date: string; onlyFree: boolean; archiveOld: boolean }) => void;
}) {
  const nextYear = (d: string | null) => {
    if (!d) return "";
    const x = new Date(d + "T12:00:00");
    x.setFullYear(x.getFullYear() + 1);
    return x.toISOString().slice(0, 10);
  };
  const [title, setTitle] = useState(list.title.replace(/\b(\d{1,2})\.(?= Geburtstag)/, (_, n) => `${Number(n) + 1}.`));
  const [date, setDate] = useState(nextYear(list.event_date));
  const [onlyFree, setOnlyFree] = useState(true);
  const [archiveOld, setArchiveOld] = useState(!list.archived_at);
  return (
    <form id="reuse-list" onSubmit={(e) => { e.preventDefault(); if (title.trim()) onSubmit({ title: title.trim(), date, onlyFree, archiveOld }); }}>
      <p className="hint mb-16">Legt eine neue Liste mit denselben Angaben an und übernimmt die Wünsche, ohne Reservierungen.</p>
      <label className="field"><span>Name der neuen Liste</span><input required maxLength={120} value={title} onChange={(e) => setTitle(e.target.value)} /></label>
      <label className="field"><span>Datum (optional)</span><input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>
      <label className="switch mb-14">
        <input type="checkbox" checked={onlyFree} onChange={(e) => setOnlyFree(e.target.checked)} />
        <span><b>Nur Wünsche übernehmen, die noch frei sind</b><br /><span className="hint">{showRes ? "Was schon verschenkt wurde, bleibt weg." : "Da du Reservierungen ausgeblendet hast, werden alle Wünsche übernommen."}</span></span>
      </label>
      {!list.archived_at && (
        <label className="switch">
          <input type="checkbox" checked={archiveOld} onChange={(e) => setArchiveOld(e.target.checked)} />
          <span><b>Alte Liste abschließen</b><br /><span className="hint">Sie wandert ins Archiv, der alte Gast-Link wird pausiert.</span></span>
        </label>
      )}
    </form>
  );
}
