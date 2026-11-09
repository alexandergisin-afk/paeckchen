// Päckli – Mails an die Eltern: Erinnerungen (14 und 3 Tage vor dem Anlass) und
// Benachrichtigungen über neue Reservierungen (täglich gesammelt oder „sofort“).
// Aufruf durch Supabase (pg_cron): täglich ohne Angabe, alle 5 Minuten mit {"mode":"instant"}. Zum Schutz muss der Aufruf
// den geheimen Header x-cron-secret mitschicken. „Verify JWT“ muss ausgeschaltet sein.
//
// Benötigte Secrets (Edge Functions → Secrets):
//   CRON_SECRET  – frei gewählte lange Zeichenfolge, identisch im Zeitplan-Aufruf
//   SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM – dein Strato-Postfach (Port 465)
//   APP_URL      – Adresse der App, z. B. https://name.github.io/paeckchen/
// SUPABASE_URL und SUPABASE_SERVICE_ROLE_KEY stellt Supabase automatisch bereit.

import nodemailer from "npm:nodemailer@6.9.16";

interface Due {
  list_id: string; kind: "14d" | "3d"; event_date: string; title: string; recipient_name: string | null;
  total: number; taken: number; hearts: number; hearts_taken: number;
  emails_with_stats: string[]; emails_plain: string[];
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
const dateDe = (d: string) => new Date(d + "T12:00:00").toLocaleDateString("de-DE", { day: "numeric", month: "long" });

export function subject(d: Due): string {
  return d.kind === "14d" ? `Noch 2 Wochen bis ${d.title}` : `In 3 Tagen: ${d.title}`;
}

export function mailHtml(d: Due, appUrl: string, withStats: boolean): string {
  const link = `${appUrl.replace(/\/?$/, "/")}#/liste/${d.list_id}`;
  const free = Math.max(0, d.total - d.taken);
  const when = d.kind === "14d" ? "in zwei Wochen" : "in drei Tagen";
  const stats = !withStats ? "" : d.total === 0
    ? `<p style="margin:0 0 14px">Auf der Liste stehen noch keine Wünsche. Jetzt ist ein guter Moment, ein paar einzutragen.</p>`
    : `<p style="margin:0 0 6px"><b>${d.taken} von ${d.total}</b> Wünschen sind vergeben.</p>
       ${d.hearts > 0 ? `<p style="margin:0 0 6px">Herzenswünsche: <b>${d.hearts_taken} von ${d.hearts}</b> vergeben.</p>` : ""}
       ${free > 0 ? `<p style="margin:12px 0 14px">Es sind noch ${free} ${free === 1 ? "Wunsch" : "Wünsche"} frei. Vielleicht magst du den Link noch einmal mit der Familie teilen.</p>` : `<p style="margin:12px 0 14px">Alles ist vergeben. Wie schön!</p>`}`;
  return `<div style="font-family:Arial,Helvetica,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#231A31;line-height:1.5">
  <p style="font-size:22px;font-weight:bold;margin:0 0 16px">🎀 Päckli</p>
  <p style="font-size:17px;margin:0 0 16px"><b>${esc(d.title)}</b> ist ${when}, am ${dateDe(d.event_date)}.</p>
  ${stats}
  <p style="margin:18px 0 24px"><a href="${link}" style="display:inline-block;background:#4B2E83;color:#ffffff;text-decoration:none;font-weight:bold;font-size:17px;padding:14px 28px;border-radius:999px">Liste öffnen</a></p>
  <p style="font-size:13px;color:#5E5470;margin:0">Du bekommst diese Erinnerung, weil du die Liste in Päckli verwaltest. Abbestellen kannst du sie in Päckli unter Einstellungen.</p>
</div>`;
}

interface Notice { email: string; list_id: string; list_title: string; items: { wish: string; name: string; quantity: number; parents_buy: boolean; entered_by_family: boolean }[] }

/** Eine Mail pro Empfänger, auch wenn mehrere Listen betroffen sind. */
export function noticeMail(email: string, notices: Notice[], appUrl: string, mode: string): { subject: string; html: string } {
  const base = appUrl.replace(/\/?$/, "/");
  const count = notices.reduce((a, n) => a + n.items.length, 0);
  const subject = notices.length === 1
    ? `${count === 1 ? "Neu reserviert" : `${count} neue Reservierungen`}: ${notices[0].list_title}`
    : `${count} neue Reservierungen in deinen Listen`;
  const blocks = notices.map((n) => `
    <p style="margin:18px 0 6px;font-weight:bold">${esc(n.list_title)}</p>
    <ul style="margin:0 0 10px;padding-left:20px">
      ${n.items.map((i) => `<li style="margin:4px 0"><b>${esc(i.name)}</b>: ${esc(i.wish)}${i.quantity > 1 ? ` (${i.quantity} Stück)` : ""}${i.parents_buy ? ` <span style="color:#9E1747">(ihr besorgt es)</span>` : ""}${i.entered_by_family ? ` <span style="color:#5E5470">(von euch eingetragen)</span>` : ""}</li>`).join("")}
    </ul>
    <a href="${base}#/liste/${n.list_id}" style="color:#4B2E83;font-weight:bold">Liste öffnen</a>`).join("");
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#231A31;line-height:1.5">
  <p style="font-size:22px;font-weight:bold;margin:0 0 12px">🎀 Päckli</p>
  <p style="font-size:17px;margin:0">${mode === "daily" ? "Seit gestern wurde reserviert:" : "Gerade wurde reserviert:"}</p>
  ${blocks}
  <p style="font-size:13px;color:#5E5470;margin:24px 0 0">Wie oft du solche Mails bekommst, stellst du in Päckli unter Einstellungen ein.</p>
</div>`;
  return { subject, html };
}

const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { "Content-Type": "application/json" } });

if (typeof Deno !== "undefined") {
  Deno.serve(async (req) => {
    const secret = Deno.env.get("CRON_SECRET");
    if (!secret || req.headers.get("x-cron-secret") !== secret) return json({ error: "unauthorized" }, 401);

    const base = Deno.env.get("SUPABASE_URL")!;
    const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const appUrl = Deno.env.get("APP_URL") ?? "";
    let body: { today?: string; dry?: boolean; mode?: "instant" | "daily" } = {};
    try { body = await req.json(); } catch { /* leer */ }

    const rpc = (fn: string, args: unknown) =>
      fetch(`${base}/rest/v1/rpc/${fn}`, {
        method: "POST",
        headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify(args),
      });

    const mode = body.mode === "instant" ? "instant" : "daily";

    // Neue Reservierungen seit dem letzten Lauf dieser Art
    const until = new Date().toISOString();
    const sinceRes = await rpc("notify_window", { p_mode: mode });
    if (!sinceRes.ok) return json({ error: "notify_window_failed", status: sinceRes.status, detail: (await sinceRes.text()).slice(0, 300) }, 500);
    const since = await sinceRes.json();
    const nRes = await rpc("reservation_notices", { p_mode: mode, p_since: since, p_until: until });
    if (!nRes.ok) return json({ error: "notices_failed", status: nRes.status, detail: (await nRes.text()).slice(0, 300) }, 500);
    const notices = (await nRes.json()) as Notice[];
    const byEmail = new Map<string, Notice[]>();
    for (const n of notices) byEmail.set(n.email, [...(byEmail.get(n.email) ?? []), n]);

    // Erinnerungen nur beim täglichen Lauf
    let due: Due[] = [];
    if (mode === "daily") {
      const res = await rpc("reminder_batch", body.today ? { p_today: body.today } : {});
      if (!res.ok) return json({ error: "batch_failed", status: res.status, detail: (await res.text()).slice(0, 300) }, 500);
      due = (await res.json()) as Due[];
    }
    if (body.dry) return json({ mode, due, notices });

    const port = Number(Deno.env.get("SMTP_PORT") ?? 465);
    const mailer = nodemailer.createTransport({
      host: Deno.env.get("SMTP_HOST"), port, secure: port === 465,
      auth: { user: Deno.env.get("SMTP_USER"), pass: Deno.env.get("SMTP_PASS") },
    });
    const from = `Päckli <${Deno.env.get("SMTP_FROM") ?? Deno.env.get("SMTP_USER")}>`;

    const report: unknown[] = [];
    for (const d of due) {
      try {
        for (const [list, withStats] of [[d.emails_with_stats, true], [d.emails_plain, false]] as const) {
          for (const to of list) {
            await mailer.sendMail({ from, to, subject: subject(d), html: mailHtml(d, appUrl, withStats) });
          }
        }
        await rpc("mark_reminder_sent", { p_list: d.list_id, p_kind: d.kind, p_event_date: d.event_date });
        report.push({ list: d.title, kind: d.kind, sent: d.emails_with_stats.length + d.emails_plain.length });
      } catch (e) {
        console.log("erinnerungen: Versand fehlgeschlagen", d.title, String(e));
        report.push({ list: d.title, kind: d.kind, error: String(e).slice(0, 200) }); // wird morgen erneut versucht
      }
    }
    // Benachrichtigungen verschicken; Zeitfenster nur weiterschieben, wenn alles geklappt hat
    let failed = 0;
    for (const [email, list] of byEmail) {
      try {
        const m = noticeMail(email, list, appUrl, mode);
        await mailer.sendMail({ from, to: email, subject: m.subject, html: m.html });
        report.push({ notice: email.replace(/^(.).*@/, "$1…@"), lists: list.length });
      } catch (e) {
        failed++;
        console.log("erinnerungen: Benachrichtigung fehlgeschlagen", String(e));
      }
    }
    if (failed === 0) await rpc("set_notify_window", { p_mode: mode, p_until: until });
    return json({ mode, processed: report, failed });
  });
}
