/** Kreis, der beim Herunterziehen erscheint; dreht sich beim Aktualisieren. */
export function PullIndicator({ pull, busy, ready }: { pull: number; busy: boolean; ready: boolean }) {
  if (!pull && !busy) return null;
  return (
    <div className="pull-indicator" style={{ transform: `translate(-50%, ${pull - 44}px)` }} role="status" aria-live="polite">
      <span className={`pull-circle ${busy ? "spinning" : ""}`} style={busy ? undefined : { transform: `rotate(${ready ? 180 : (pull / 64) * 180}deg)` }}>
        {busy ? (
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"><path d="M21 12a9 9 0 11-3-6.7" /></svg>
        ) : (
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 5v14M6 13l6 6 6-6" /></svg>
        )}
      </span>
      <span className="sr">{busy ? "Wird aktualisiert" : ready ? "Zum Aktualisieren loslassen" : "Zum Aktualisieren ziehen"}</span>
    </div>
  );
}
