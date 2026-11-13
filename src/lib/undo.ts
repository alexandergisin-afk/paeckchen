/**
 * „Rückgängig“ statt Rückfrage: Die Aktion wird erst nach einigen Sekunden wirklich ausgeführt.
 * Verlässt man die App vorher, wird sie sofort ausgeführt, damit nichts hängen bleibt.
 */
const pending = new Map<number, () => Promise<void>>();
let seq = 0;

export function deferred(run: () => Promise<void>, ms = 6000): { cancel: () => void } {
  const id = ++seq;
  pending.set(id, run);
  const timer = window.setTimeout(() => { const r = pending.get(id); pending.delete(id); r?.(); }, ms);
  return {
    cancel: () => { window.clearTimeout(timer); pending.delete(id); },
  };
}

function flushAll() {
  for (const [id, run] of pending) { pending.delete(id); void run(); }
}
if (typeof window !== "undefined") {
  window.addEventListener("pagehide", flushAll);
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") flushAll(); });
}
