/**
 * Platzhalter beim Laden: graue Umrisse in Form der späteren Inhalte.
 * Wirkt schneller als ein Text, und nichts springt, wenn die Daten kommen.
 * Für Screenreader gibt es einen kurzen Hinweis.
 */
function Bar({ w, h = 14, r = 8 }: { w: string; h?: number; r?: number }) {
  return <span className="sk" style={{ width: w, height: h, borderRadius: r }} />;
}

/** Zeilen wie in der Übersicht oder der Wunschliste */
export function SkeletonRows({ count = 3, label = "Wird geladen" }: { count?: number; label?: string }) {
  return (
    <div className="sk-rows" role="status" aria-label={label}>
      {Array.from({ length: count }, (_, i) => (
        <div className="sk-row" key={i}>
          <span className="sk sk-thumb" />
          <span className="sk-lines"><Bar w="62%" h={16} /><Bar w="40%" /><Bar w="52%" h={8} /></span>
        </div>
      ))}
    </div>
  );
}

/** Kopf einer Liste mit drei Kacheln, danach Wunschzeilen */
export function SkeletonListPage() {
  return (
    <div className="wrap" role="status" aria-label="Liste wird geladen">
      <div className="sk-hero">
        <span className="sk sk-cover" />
        <span className="sk-lines"><Bar w="70%" h={24} /><Bar w="50%" /></span>
      </div>
      <div className="sk-tiles3"><span className="sk" /><span className="sk" /><span className="sk" /></div>
      <SkeletonRows count={3} />
    </div>
  );
}

/** Kacheln wie in der Gästeansicht */
export function SkeletonGuest() {
  return (
    <div className="wrap" role="status" aria-label="Wunschliste wird geladen">
      <div className="sk-lines" style={{ marginBottom: 18 }}><Bar w="30%" h={10} /><Bar w="72%" h={26} /><Bar w="48%" /></div>
      <div className="sk-grid">
        {Array.from({ length: 4 }, (_, i) => (
          <div className="sk-card" key={i}>
            <span className="sk sk-img" />
            <span className="sk-lines" style={{ padding: 12 }}><Bar w="45%" h={12} /><Bar w="85%" h={16} /><Bar w="35%" h={16} /></span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Statistik: ein paar Kästen */
export function SkeletonPanels({ count = 3 }: { count?: number }) {
  return (
    <div className="wrap narrow" role="status" aria-label="Statistik wird berechnet">
      <div className="sk-lines" style={{ marginBottom: 18 }}><Bar w="40%" h={28} /></div>
      {Array.from({ length: count }, (_, i) => (
        <div className="sk-panel" key={i}><Bar w="30%" h={18} /><div className="sk-tiles2"><span className="sk" /><span className="sk" /></div></div>
      ))}
    </div>
  );
}
