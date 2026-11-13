import { defineConfig, type Plugin } from "vite";
import { createHash } from "node:crypto";
import react from "@vitejs/plugin-react";

/**
 * Lädt die wichtigsten Programmteile und Schriften gleich zusammen mit dem Hauptprogramm,
 * statt erst danach: Übersicht, Listenseite und Gästeansicht (plus deren Bausteine) sowie
 * die drei Schriftdateien. Seltenere Seiten werden im Leerlauf nachgeladen (siehe App.tsx).
 */
function preloadCore(): Plugin {
  const CORE_PAGES = ["Dashboard", "ListPage", "GuestPage"];
  const FONTS = [/atkinson-hyperlegible-latin-400-normal/, /atkinson-hyperlegible-latin-700-normal/, /bricolage-grotesque-latin-opsz-normal/];
  return {
    name: "paeckli-preload-core",
    apply: "build",
    transformIndexHtml: {
      order: "post",
      handler(html, ctx) {
        const bundle = ctx.bundle;
        if (!bundle) return html;
        const chunks = new Set<string>();
        const add = (file: string) => {
          if (chunks.has(file)) return;
          const c = bundle[file];
          if (!c || c.type !== "chunk") return;
          chunks.add(file);
          c.imports.forEach(add);
        };
        for (const [file, c] of Object.entries(bundle)) {
          if (c.type === "chunk" && c.facadeModuleId && CORE_PAGES.some((p) => c.facadeModuleId!.endsWith(`/pages/${p}.tsx`))) add(file);
        }
        // Das Hauptprogramm selbst lädt Vite ohnehin
        for (const [file, c] of Object.entries(bundle)) if (c.type === "chunk" && c.isEntry) chunks.delete(file);
        const fonts = Object.keys(bundle).filter((f) => f.endsWith(".woff2") && FONTS.some((r) => r.test(f)));
        const tags = [
          ...[...chunks].map((f) => `<link rel="modulepreload" crossorigin href="./${f}">`),
          ...fonts.map((f) => `<link rel="preload" as="font" type="font/woff2" crossorigin href="./${f}">`),
        ];
        return html.replace("</head>", `    ${tags.join("\n    ")}\n  </head>`);
      },
    },
  };
}

/**
 * Offline-Modus: erzeugt beim Bauen einen Service Worker (sw.js) mit der Liste aller Dateien dieser Version.
 * - Programmteile, Schriften, Symbole: aus dem Gerätespeicher (ändern ihren Namen bei jeder Version)
 * - Startseite: immer zuerst aus dem Netz, nur ohne Netz aus dem Speicher (so bleibt niemand auf einer alten Version)
 * - Anfragen an Supabase fasst der Service Worker nicht an (die Daten speichert die App selbst, siehe lib/cache.ts)
 */
function serviceWorker(): Plugin {
  return {
    name: "paeckli-service-worker",
    apply: "build",
    generateBundle(_opts, bundle) {
      // Nur, was Päckli wirklich braucht: keine .map-Dateien, keine Schrift-Varianten für andere Alphabete oder alte Browser
      const files = Object.keys(bundle).filter((f) => !f.endsWith(".map") && f !== "sw.js"
        && !/-(vietnamese|latin-ext|cyrillic|cyrillic-ext|greek|greek-ext)-/.test(f) && !f.endsWith(".woff"));
      const pub = ["manifest.webmanifest", "favicon.svg", "icon-192.png", "icon-512.png", "icon-maskable-512.png", "apple-touch-icon.png"];
      const assets = ["./", ...files.filter((f) => f !== "index.html").map((f) => `./${f}`), ...pub.map((f) => `./${f}`)];
      const version = createHash("sha256").update(files.sort().join("|")).digest("hex").slice(0, 12);
      this.emitFile({ type: "asset", fileName: "sw.js", source: swSource(version, assets) });
    },
  };
}

function swSource(version: string, assets: string[]) {
  return `// Päckli Service Worker – automatisch erzeugt, Version ${version}
const CACHE = "paeckli-${version}";
const ASSETS = ${JSON.stringify(assets)};
const START = new URL("./", self.registration.scope).href;

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS.map((a) => new Request(a, { cache: "reload" })))).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil((async () => {
    // Die vorige Version noch behalten: bereits offene Seiten laden evtl. noch ihre Programmteile nach
    const old = (await caches.keys()).filter((k) => k.startsWith("paeckli-") && k !== CACHE).sort();
    for (const k of old.slice(0, -1)) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // Supabase & Co.: nicht anfassen
  if (req.mode === "navigate") return e.respondWith(startPage(req));
  e.respondWith(fromCache(req));
});

async function startPage(req) {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 4000);
    const res = await fetch(req, { signal: ctrl.signal });
    clearTimeout(timer);
    if (res.ok) (await caches.open(CACHE)).put(START, res.clone());
    return res;
  } catch {
    return (await caches.match(START)) || (await caches.match(req)) || Response.error();
  }
}

async function fromCache(req) {
  const hit = await caches.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok && res.type === "basic") (await caches.open(CACHE)).put(req, res.clone());
  return res;
}
`;
}

// Relative Pfade: funktioniert unter github.io/paeckchen/ und später unter eigener Domain.
export default defineConfig({
  plugins: [react(), preloadCore(), serviceWorker()],
  base: "./",
});
