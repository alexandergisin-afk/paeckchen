import { useRef, useState, type KeyboardEvent, type MouseEvent, type PointerEvent } from "react";
import { moveItem } from "./listSort";

const HOLD_MS = 450;   // so lange gedrückt halten, bis die Liste „angehoben“ wird
const SLOP_PX = 8;     // wer sich vorher weiter bewegt, will scrollen

type Session = {
  id: string; x: number; y: number; startY: number; order: string[]; timer: number; active: boolean;
  kind: "touch" | "mouse"; moved: boolean; capture?: { el: HTMLElement; pointerId: number };
};

/**
 * Verschieben durch Gedrückthalten und Ziehen, wie auf dem Startbildschirm des Handys.
 * Kurzes Tippen öffnet wie gewohnt, normales Wischen scrollt. Beim Loslassen wird gespeichert.
 * Touch läuft über die Touch-Ereignisse des Browsers (nur so lässt sich das Scrollen beim Ziehen stoppen),
 * die Maus über Pointer-Ereignisse. Tastatur: Alt + Pfeil hoch/runter auf einer Liste.
 */
export function useLongPressSort(ids: string[], commit: (order: string[]) => void) {
  const rows = useRef(new Map<string, HTMLElement>());
  const wired = useRef(new WeakSet<HTMLElement>());
  const st = useRef<Session | null>(null);
  const suppressClick = useRef(false);
  const idsRef = useRef(ids);
  idsRef.current = ids;
  const commitRef = useRef(commit);
  commitRef.current = commit;
  const [live, setLive] = useState<string[] | null>(null);
  const [drag, setDrag] = useState<{ id: string; offset: number } | null>(null);

  const step = (ord: string[], i: number, dir: -1 | 1) => {
    const me = rows.current.get(ord[i]);
    const other = rows.current.get(ord[i + dir]);
    if (!me || !other) return 0;
    return dir === 1 ? other.offsetTop + other.offsetHeight - (me.offsetTop + me.offsetHeight) : me.offsetTop - other.offsetTop;
  };

  const reset = () => {
    delete document.body.dataset.dragging;
    if (st.current) window.clearTimeout(st.current.timer);
    st.current = null;
    setDrag(null);
    setLive(null);
  };

  // ---- gemeinsame Logik für Finger und Maus ----
  const start = (id: string, x: number, y: number, kind: Session["kind"], capture?: Session["capture"]) => {
    suppressClick.current = false; // neue Berührung: ein alter „Klick unterdrücken“ gilt nicht mehr
    if (idsRef.current.length < 2) return;
    const s: Session = { id, x, y, startY: y, order: [...idsRef.current], timer: 0, active: false, kind, moved: false, capture };
    s.timer = window.setTimeout(() => {
      if (st.current !== s) return;
      s.active = true;
      document.body.dataset.dragging = "1"; // „Ziehen zum Aktualisieren“ pausiert währenddessen
      // Erst jetzt den Mauszeiger an die Zeile binden (früher würde der Browser
      // ein späteres Loslassen woanders als Klick auf diese Zeile werten)
      if (s.capture) { try { s.capture.el.setPointerCapture(s.capture.pointerId); } catch { /* egal */ } }
      navigator.vibrate?.(12);
      setLive(s.order);
      setDrag({ id, offset: 0 });
    }, HOLD_MS);
    st.current = s;
  };

  /** true = Bewegung gehört zum Verschieben (Scrollen verhindern) */
  const move = (x: number, y: number): boolean => {
    const s = st.current;
    if (!s) return false;
    if (!s.active) {
      if (Math.hypot(x - s.x, y - s.y) > SLOP_PX) {
        // Das ist Scrollen bzw. Wegziehen, kein Verschieben. Bei der Maus darf daraus kein Klick werden.
        if (s.kind === "mouse") suppressClick.current = true;
        reset();
      }
      return false;
    }
    let offset = y - s.startY;
    const i = s.order.indexOf(s.id);
    const down = step(s.order, i, 1);
    const up = step(s.order, i, -1);
    if (down && offset > down / 2) {
      s.order = moveItem(s.order, i, 1); s.startY += down; offset -= down; setLive(s.order);
    } else if (up && offset < -up / 2) {
      s.order = moveItem(s.order, i, -1); s.startY -= up; offset += up; setLive(s.order);
    }
    setDrag({ id: s.id, offset });
    return true;
  };

  const end = () => {
    const s = st.current;
    if (s?.active) {
      suppressClick.current = true; // das Loslassen soll die Liste nicht öffnen
      if (s.order.join() !== idsRef.current.join()) commitRef.current(s.order);
    }
    reset();
  };

  // ---- Finger: eigene, nicht-passive Touch-Listener ----
  const register = (id: string) => (el: HTMLElement | null) => {
    if (!el) { rows.current.delete(id); return; }
    rows.current.set(id, el);
    if (wired.current.has(el)) return;
    wired.current.add(el);
    el.addEventListener("touchstart", (e) => { if (e.touches.length === 1) start(id, e.touches[0].clientX, e.touches[0].clientY, "touch"); }, { passive: true });
    el.addEventListener("touchmove", (e) => {
      const t = e.touches[0];
      if (t && move(t.clientX, t.clientY) && e.cancelable) e.preventDefault();
    }, { passive: false });
    el.addEventListener("touchend", (e) => { if (st.current?.active && e.cancelable) e.preventDefault(); end(); }, { passive: false });
    el.addEventListener("touchcancel", () => end());
  };

  // ---- Maus: Pointer-Ereignisse ----
  const onPointerDown = (id: string) => (e: PointerEvent<HTMLElement>) => {
    if (e.pointerType !== "mouse" || e.button !== 0) return;
    start(id, e.clientX, e.clientY, "mouse", { el: e.currentTarget, pointerId: e.pointerId });
  };
  const onPointerMove = (e: PointerEvent<HTMLElement>) => { if (e.pointerType === "mouse") move(e.clientX, e.clientY); };
  const onPointerUp = (e: PointerEvent<HTMLElement>) => { if (e.pointerType === "mouse") end(); };

  const onClickCapture = (e: MouseEvent<HTMLElement>) => {
    if (!suppressClick.current) return;
    suppressClick.current = false;
    e.preventDefault();
    e.stopPropagation();
  };

  const onKeyDown = (id: string) => (e: KeyboardEvent<HTMLElement>) => {
    if (!e.altKey || (e.key !== "ArrowUp" && e.key !== "ArrowDown")) return;
    e.preventDefault();
    const cur = idsRef.current;
    const next = moveItem(cur, cur.indexOf(id), e.key === "ArrowUp" ? -1 : 1);
    if (next !== cur) commitRef.current(next);
  };

  const rowProps = (id: string) => ({
    ref: register(id),
    onPointerDown: onPointerDown(id),
    onPointerMove,
    onPointerUp,
    onPointerCancel: onPointerUp,
    onClickCapture,
    onKeyDown: onKeyDown(id),
    onContextMenu: (e: MouseEvent) => e.preventDefault(), // kein Menü beim Gedrückthalten
  });

  return { live, drag, rowProps };
}
