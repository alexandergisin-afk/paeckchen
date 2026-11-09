import { defineConfig, devices } from "@playwright/test";

// Oberflächentests mit nachgebildeter Datenbank: Die App wird mit einer Test-Adresse gebaut,
// alle Anfragen an Supabase beantworten die Tests selbst (siehe e2e/mock.ts).
export default defineConfig({
  testDir: "e2e",
  timeout: 30_000,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: "http://localhost:4180",
    ...devices["Pixel 5"],
    // Lokal kann ein vorhandener Chromium verwendet werden (CHROMIUM_PATH), in GitHub der mitinstallierte.
    launchOptions: process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {},
  },
  webServer: {
    command: "npx vite build --outDir dist-e2e && npx vite preview --outDir dist-e2e --port 4180 --strictPort",
    url: "http://localhost:4180",
    timeout: 120_000,
    reuseExistingServer: !process.env.CI,
    env: { VITE_SUPABASE_URL: "https://e2e.supabase.co", VITE_SUPABASE_ANON_KEY: "e2e" },
  },
});
