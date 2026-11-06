export function Setup() {
  return (
    <div className="wrap narrow">
      <h1>Fast geschafft</h1>
      <p className="lead">
        Die App ist online, aber noch nicht mit der Datenbank verbunden. Trag in GitHub unter
        „Settings → Secrets and variables → Actions → Variables“ die beiden Werte
        <b> VITE_SUPABASE_URL</b> und <b>VITE_SUPABASE_ANON_KEY</b> ein und starte die
        Veröffentlichung unter „Actions“ erneut.
      </p>
    </div>
  );
}
