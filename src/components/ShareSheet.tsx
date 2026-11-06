import { useState } from "react";
import { Link } from "react-router-dom";
import { guestLink } from "../lib/supabase";
import type { WishList } from "../lib/types";
import { IconChat, IconMail, IconShare } from "./Icons";

export function ShareContent({ list, onNavigate }: { list: WishList; onNavigate: () => void }) {
  const link = guestLink(list.guest_token);
  const [copied, setCopied] = useState<null | "ok" | "fail">(null);
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
      <button className="btn soft block" onClick={share} style={{ marginBottom: 10 }}><IconShare /> Anders teilen …</button>
      <Link className="btn line block" to={`/w/${list.guest_token}`} onClick={onNavigate}>Als Gast ansehen</Link>
    </>
  );
}
