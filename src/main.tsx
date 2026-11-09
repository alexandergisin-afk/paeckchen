import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
// Schriften werden mit der App ausgeliefert (keine Anfragen an Google, schneller, datenschutzfreundlich)
import "@fontsource/atkinson-hyperlegible/latin-400.css";
import "@fontsource/atkinson-hyperlegible/latin-700.css";
import "@fontsource-variable/bricolage-grotesque/opsz.css";
import "./fonts.css";
import "./styles.css";
import { applyTextSize } from "./lib/device";
import "./lib/install";
import { captureShareFromLaunch } from "./lib/share";
import { installErrorReporting } from "./lib/errorlog";

installErrorReporting();

captureShareFromLaunch();

applyTextSize();

// Abgelaufene oder ungültige Anmeldelinks kommen als #error=… zurück. Das würde den Router verwirren,
// deshalb lesen wir die Meldung vorher aus und räumen die Adresse auf.
let linkError: string | null = null;
const raw = window.location.hash.startsWith("#error") ? window.location.hash.slice(1) : window.location.search.slice(1);
const params = new URLSearchParams(raw);
if (params.get("error")) {
  linkError =
    params.get("error_code") === "otp_expired"
      ? "Dieser Anmeldelink ist abgelaufen oder wurde schon benutzt. Fordere einfach einen neuen an."
      : "Die Anmeldung hat nicht geklappt. Fordere bitte einen neuen Link an.";
  window.history.replaceState(null, "", window.location.pathname + "#/");
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App linkError={linkError} />
  </StrictMode>,
);
