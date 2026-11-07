/** Hilft beim Installieren als App auf dem Startbildschirm. */
interface InstallPromptEvent extends Event { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> }

let deferred: InstallPromptEvent | null = null;
const listeners = new Set<() => void>();

// Android/Chrome: Der Browser bietet die Installation an, wir zeigen dafür einen eigenen Knopf.
window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  deferred = e as InstallPromptEvent;
  listeners.forEach((l) => l());
});
window.addEventListener("appinstalled", () => {
  deferred = null;
  listeners.forEach((l) => l());
});

export const canPrompt = () => deferred !== null;
export const onInstallChange = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };
export async function promptInstall() {
  if (!deferred) return;
  await deferred.prompt();
  await deferred.userChoice.catch(() => null);
  deferred = null;
  listeners.forEach((l) => l());
}
export const isInstalled = () =>
  window.matchMedia("(display-mode: standalone)").matches || (navigator as unknown as { standalone?: boolean }).standalone === true;
export const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
