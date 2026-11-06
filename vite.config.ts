import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Relative Pfade: funktioniert unter github.io/paeckchen/ und später unter eigener Domain.
export default defineConfig({
  plugins: [react()],
  base: "./",
});
