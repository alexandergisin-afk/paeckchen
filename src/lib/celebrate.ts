/**
 * Kleine Freudenmomente: kurzer Konfetti-Regen in den Päckli-Farben.
 * Ohne Bibliothek, auf einer Zeichenfläche über der Seite, die sich danach selbst entfernt.
 * Wer am Gerät „Bewegung reduzieren“ eingestellt hat, bekommt kein Konfetti.
 */
const COLORS = ["#D2306A", "#4B2E83", "#1D7A5A", "#F5B700", "#9B7BE0", "#FF8FB1"];

export function prefersCalm(): boolean {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

export function celebrate(strength: "small" | "big" = "small") {
  if (typeof document === "undefined" || prefersCalm()) return;
  navigator.vibrate?.(strength === "big" ? [12, 60, 12] : 12);
  const canvas = document.createElement("canvas");
  canvas.className = "confetti";
  canvas.setAttribute("aria-hidden", "true");
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = innerWidth * dpr;
  canvas.height = innerHeight * dpr;
  document.body.appendChild(canvas);
  const ctx = canvas.getContext("2d");
  if (!ctx) { canvas.remove(); return; }
  ctx.scale(dpr, dpr);

  const n = strength === "big" ? 140 : 70;
  const parts = Array.from({ length: n }, (_, i) => {
    const fromLeft = i % 2 === 0;
    return {
      x: fromLeft ? innerWidth * 0.15 : innerWidth * 0.85,
      y: innerHeight * 0.65,
      vx: (fromLeft ? 1 : -1) * (2 + Math.random() * 5),
      vy: -(8 + Math.random() * 7),
      r: Math.random() * Math.PI,
      vr: (Math.random() - 0.5) * 0.3,
      w: 6 + Math.random() * 6,
      h: 4 + Math.random() * 4,
      c: COLORS[i % COLORS.length],
    };
  });

  const start = performance.now();
  const life = strength === "big" ? 2200 : 1600;
  const frame = (t: number) => {
    const age = t - start;
    ctx.clearRect(0, 0, innerWidth, innerHeight);
    ctx.globalAlpha = Math.max(0, 1 - age / life);
    for (const p of parts) {
      p.vy += 0.32;          // Schwerkraft
      p.vx *= 0.985;         // Luftwiderstand
      p.x += p.vx;
      p.y += p.vy;
      p.r += p.vr;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.r);
      ctx.fillStyle = p.c;
      ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h * Math.abs(Math.cos(p.r * 2)) + 1);
      ctx.restore();
    }
    if (age < life) requestAnimationFrame(frame);
    else canvas.remove();
  };
  requestAnimationFrame(frame);
}

/** Einmalig pro Liste: „Alles vergeben!“ (merkt sich das Gerät). */
export function celebrateOnce(key: string, strength: "small" | "big" = "big"): boolean {
  try {
    if (localStorage.getItem(key)) return false;
    localStorage.setItem(key, "1");
  } catch { /* egal */ }
  celebrate(strength);
  return true;
}
