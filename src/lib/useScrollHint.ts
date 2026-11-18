import { useEffect, useRef } from "react";

/**
 * Für waagerecht wischbare Reihen: setzt „more-left“/„more-right“, solange es in die Richtung weitergeht
 * (für den Verlauf am Rand), und rückt den ausgewählten Eintrag ins Bild.
 */
export function useScrollHint<T extends HTMLElement>(selectedKey?: string) {
  const ref = useRef<T>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => {
      el.classList.toggle("more-left", el.scrollLeft > 4);
      el.classList.toggle("more-right", el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
    };
    update();
    el.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => { el.removeEventListener("scroll", update); window.removeEventListener("resize", update); };
  });

  // Ausgewählten Eintrag ins Bild rücken (z. B. wenn man aus einer Liste kommt)
  useEffect(() => {
    const el = ref.current;
    const sel = el?.querySelector<HTMLElement>('[aria-pressed="true"]');
    if (!el || !sel) return;
    const target = sel.offsetLeft - (el.clientWidth - sel.offsetWidth) / 2;
    el.scrollTo({ left: Math.max(0, target), behavior: "auto" });
  }, [selectedKey]);

  return ref;
}
