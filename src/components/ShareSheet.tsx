import { useState } from "react";
import { Link } from "react-router-dom";
import { guestLink } from "../lib/supabase";
import type { WishList } from "../lib/types";
import { IconChat, IconMail, IconQr, IconShare } from "./Icons";

export function ShareContent({ list, onNavigate }: { list: WishList; onNavigate: () => void }) {
  const link = guestLink(list.guest_token);
  const [copied, setCopied] = useState<null | "ok" | "fail">(null);
  const [qr, setQr] = useState<string | null>(null);
  const showQr = async () => {
    if (qr) return setQr(null);
    const { default: qrcode } = await import("qrcode-generator");
    const code = qrcode(0, "M");
    code.addData(link);
    code.make();
    setQr(code.createDataURL(8, 4)); // als Bild: lässt sich lange drücken und speichern
  };
  const text = `Hallo! Hier ist die Wunschliste „${list.title}“. Such dir gern ein Geschenk aus und reservier es mit einem Tipp, ganz ohne Anmeldung: ${link}`;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied("ok");
    } catch {
      setCopied("fail");
    }
    window.setTimeout(() => setCopied(null), 2000);
  };

  const share = async () => {
    try {
      if (!navigator.share) throw new Error("kein Teilen-Menü");
      await navigator.share({ title: list.title, text: `Wunschliste „${list.title}“`, url: link });
    } catch (e) {
      if ((e as Error).name !== "AbortError") copy();
    }
  };

  return (
    <>
      <h2>{list.title} teilen</h2>
      <p className="hint">Mit diesem Link sehen Schenkende die Wünsche und können reservieren. Bearbeiten können sie nichts, und eure Namen sehen sie nicht.</p>
      <div className="linkbox">
        <code>{link}</code>
        <button className="btn small" onClick={copy}>{copied === "ok" ? "Kopiert ✓" : copied === "fail" ? "Bitte markieren" : "Kopieren"}</button>
      </div>
      <div className="sharegrid">
        <a className="btn soft" href={`https://wa.me/?text=${encodeURIComponent(text)}`} target="_blank" rel="noopener noreferrer"><IconChat /> WhatsApp</a>
        <a className="btn soft" href={`mailto:?subject=${encodeURIComponent("Wunschliste: " + list.title)}&body=${encodeURIComponent(text)}`}><IconMail /> E-Mail</a>
      </div>
      <div className="sharegrid">
        <button className="btn soft" onClick={share}><IconShare /> Anders teilen</button>
        <button className="btn soft" onClick={showQr} aria-expanded={!!qr}><IconQr /> QR-Code</button>
      </div>
      {qr && (
        <div className="qr-box">
          <img src={qr} alt={`QR-Code für die Wunschliste „${list.title}“`} width={232} height={232} />
          <p className="hint">Zum Ausdrucken, etwa für die Einladungskarte. Auf dem Handy lange drücken zum Speichern.</p>
          <a className="btn line small" href={qr} download={`paeckli-${list.title.replace(/[^\wäöüÄÖÜß-]+/g, "-")}.gif`}>Bild herunterladen</a>
        </div>
      )}
      <Link className="btn line block" to={`/w/${list.guest_token}`} onClick={onNavigate}>Als Gast ansehen</Link>
    </>
  );
}
