import { Component, type ReactNode } from "react";
import { reportError } from "../lib/errorlog";

/** Fängt Abstürze einer Seite ab: statt weißer Fläche ein freundlicher Hinweis mit „Neu laden“. */
export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error) {
    reportError(error.message, error.stack);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    // Nach einem Update fehlen manchmal alte Programmteile: dann hilft Neuladen
    return (
      <div className="wrap narrow">
        <h1>Da ist etwas schiefgelaufen.</h1>
        <p className="lead">Das tut uns leid. Meist hilft es, die Seite neu zu laden. Der Fehler wurde gemeldet.</p>
        <p style={{ marginTop: 18 }}><button className="btn" onClick={() => window.location.reload()}>Neu laden</button></p>
      </div>
    );
  }
}
