import { defineConfig, type Plugin } from "vite";
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

// Relative Pfade: funktioniert unter github.io/paeckchen/ und später unter eigener Domain.
export default defineConfig({
  plugins: [react(), preloadCore()],
  base: "./",
});
