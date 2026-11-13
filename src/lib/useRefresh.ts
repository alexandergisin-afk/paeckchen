import { useEffect, useRef, useState } from "react";

const PULL_MAX = 110;     // so weit lässt sich der Kreis höchstens herunterziehen
const PULL_TRIGGER = 64;  // ab hier wird beim Loslassen aktualisiert

/**
 * Nach unten ziehen zum Aktualisieren (wie bei Mail oder WhatsApp). Wichtig für die installierte App,
 * die keine Browser-Leiste zum Neuladen hat. Nur wenn man ganz oben ist, kein Dialog offen ist
 * und gerade keine Liste verschoben wird.
 */
export function usePullToRefresh(onRefresh: () => Promise<unknown> | unknown) {
  const [pull, setPull] = useState(0);
  const [busy, setBusy] = useState(false);
  const cb = useRef(onRefresh);
  cb.current = onRefresh;

  useEffect(() => {
    let startY: number | null = null;
    let dist = 0;
    const blocked = () => !!document.querySelector("dialog[open]") || document.body.dataset.dragging === "1";
    const start = (e: TouchEvent) => {
      startY = window.scrollY <= 0 && e.touches.length === 1 && !blocked() ? e.touches[0].clientY : null;
      dist = 0;
    };
    const move = (e: TouchEvent) => {
      if (startY === null) return;
      if (blocked() || window.scrollY > 0) { startY = null; dist = 0; setPull(0); return; }
      const dy = e.touches[0].clientY - startY;
      if (dy <= 0) { if (dist) { dist = 0; setPull(0); } return; }
      dist = Math.min(PULL_MAX, dy * 0.5); // gedämpft, fühlt sich „schwer“ an
      setPull(dist);
      if (e.cancelable) e.preventDefault();
    };
    const end = async () => {
      if (startY === null) return;
      startY = null;
      if (dist >= PULL_TRIGGER) {
        setBusy(true);
        setPull(PULL_TRIGGER);
        try { await cb.current(); } finally { setBusy(false); setPull(0); }
      } else setPull(0);
      dist = 0;
    };
    window.addEventListener("touchstart", start, { passive: true });
    window.addEventListener("touchmove", move, { passive: false });
    window.addEventListener("touchend", end);
    window.addEventListener("touchcancel", end);
    return () => {
      window.removeEventListener("touchstart", start);
      window.removeEventListener("touchmove", move);
      window.removeEventListener("touchend", end);
      window.removeEventListener("touchcancel", end);
    };
  }, []);

  return { pull, busy, ready: pull >= PULL_TRIGGER };
}

/** Frisch laden, wenn man nach einer Weile in die App zurückkehrt. */
export function useRefreshOnReturn(onRefresh: () => unknown, afterMs = 30_000) {
  const cb = useRef(onRefresh);
  cb.current = onRefresh;
  useEffect(() => {
    let hiddenAt = 0;
    const onVis = () => {
      if (document.visibilityState === "hidden") hiddenAt = Date.now();
      else if (hiddenAt && Date.now() - hiddenAt >= afterMs) { hiddenAt = 0; cb.current(); }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [afterMs]);
}
