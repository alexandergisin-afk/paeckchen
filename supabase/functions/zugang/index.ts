// Päckli – Zugang für neue Bearbeiter nur nach Freigabe durch einen Administrator
// „Verify JWT“ in Supabase ausschalten: die Funktion prüft Anmeldungen selbst.
//
// Aktionen (POST, JSON):
//   { action: "request", email }             unbekannte Adresse meldet sich an → Anfrage + Mail an die Verwaltung
//   { action: "invite", email, list_id }     Einladen (mit Anmeldung): Admin schaltet frei, sonst Anfrage + Mail
//   { action: "decide", id, approve }        Admin gibt frei oder lehnt ab; bei Freigabe geht die Code-Mail raus
//
// Secrets wie bei „erinnerungen“: SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM, APP_URL.
// SUPABASE_URL, SUPABASE_ANON_KEY und SUPABASE_SERVICE_ROLE_KEY stellt Supabase bereit.

import nodemailer from "npm:nodemailer@6.9.16";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...CORS, "Content-Type": "application/json" } });
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));

export function adminMail(email: string, info: { invited_by?: string | null; list_title?: string | null } | null, appUrl: string) {
  const who = info?.invited_by
    ? `<b>${esc(info.invited_by)}</b> möchte <b>${esc(email)}</b> ${info.list_title ? `zur Liste „${esc(info.list_title)}“ ` : ""}einladen.`
    : `<b>${esc(email)}</b> möchte sich bei Päckli anmelden, ohne Einladung.`;
  const link = `${appUrl.replace(/\/?$/, "/")}#/einstellungen/anfragen`;
  return {
    subject: `Zugangsanfrage: ${email}`,
    html: `<div style="font-family:Arial,Helvetica,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#231A31;line-height:1.5">
  <p style="font-size:22px;font-weight:bold;margin:0 0 16px">🎀 Päckli</p>
  <p style="font-size:17px;margin:0 0 16px">${who}</p>
  <p style="margin:0 0 22px">Erst wenn du freigibst, bekommt die Person ihre Mail mit dem Anmeldecode.</p>
  <p style="margin:0 0 24px"><a href="${link}" style="display:inline-block;background:#4B2E83;color:#ffffff;text-decoration:none;font-weight:bold;font-size:17px;padding:14px 28px;border-radius:999px">Anfrage ansehen</a></p>
  <p style="font-size:13px;color:#5E5470;margin:0">Du bekommst diese Mail, weil du in Päckli Administrator bist.</p>
</div>`,
  };
}

if (typeof Deno !== "undefined") {
  Deno.serve(async (req) => {
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
    if (req.method !== "POST") return json({ error: "method" }, 405);

    const base = Deno.env.get("SUPABASE_URL")!;
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const appUrl = Deno.env.get("APP_URL") ?? "";
    let body: { action?: string; email?: string; list_id?: string; id?: string; approve?: boolean } = {};
    try { body = await req.json(); } catch { return json({ error: "bad_request" }, 400); }

    const rpc = (fn: string, args: unknown, jwt?: string) =>
      fetch(`${base}/rest/v1/rpc/${fn}`, {
        method: "POST",
        headers: { apikey: jwt ? anon : service, Authorization: `Bearer ${jwt ?? service}`, "Content-Type": "application/json" },
        body: JSON.stringify(args),
      });
    const userJwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    const signedIn = userJwt && userJwt !== anon;

    const notifyAdmins = async (email: string) => {
      try {
        const [infoRes, adminsRes] = await Promise.all([rpc("access_request_info", { p_email: email }), rpc("admin_emails", {})]);
        const info = infoRes.ok ? await infoRes.json() : null;
        const admins = adminsRes.ok ? ((await adminsRes.json()) as string[]) : [];
        if (!admins.length) return console.log("zugang: keine Administratoren hinterlegt");
        const port = Number(Deno.env.get("SMTP_PORT") ?? 465);
        const mailer = nodemailer.createTransport({
          host: Deno.env.get("SMTP_HOST"), port, secure: port === 465,
          auth: { user: Deno.env.get("SMTP_USER"), pass: Deno.env.get("SMTP_PASS") },
        });
        const m = adminMail(email, info, appUrl);
        const from = `Päckli <${Deno.env.get("SMTP_FROM") ?? Deno.env.get("SMTP_USER")}>`;
        for (const to of admins) await mailer.sendMail({ from, to, subject: m.subject, html: m.html });
      } catch (e) {
        console.log("zugang: Mail an die Verwaltung fehlgeschlagen", String(e)); // Anfrage bleibt trotzdem in der App sichtbar
      }
    };

    // 1) Unbekannte Adresse meldet sich an
    if (body.action === "request") {
      const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || null;
      const r = await rpc("request_access", { p_email: body.email ?? "", p_ip: ip });
      if (!r.ok) return json({ error: "request_failed", status: r.status }, 500);
      const out = (await r.json()) as { status: string; notify?: boolean };
      if (out.status === "pending" && out.notify) await notifyAdmins((body.email ?? "").trim().toLowerCase());
      return json({ status: out.status });
    }

    if (!signedIn) return json({ error: "not_authenticated" }, 401);

    // 2) Einladen
    if (body.action === "invite") {
      const r = await rpc("allow_email", { p_email: body.email ?? "", p_list: body.list_id ?? null }, userJwt);
      const text = await r.text();
      if (!r.ok) return json({ error: /invalid_email/.test(text) ? "invalid_email" : /forbidden|42501/.test(text) ? "forbidden" : "invite_failed" }, r.status === 401 ? 401 : 400);
      const status = JSON.parse(text) as string;
      if (status === "pending") await notifyAdmins((body.email ?? "").trim().toLowerCase());
      return json({ status });
    }

    // 3) Freigeben oder ablehnen
    if (body.action === "decide") {
      const r = await rpc("decide_access", { p_id: body.id, p_approve: !!body.approve }, userJwt);
      const text = await r.text();
      if (!r.ok) return json({ error: /forbidden|42501/.test(text) ? "forbidden" : /not_found/.test(text) ? "not_found" : "decide_failed" }, r.status === 401 ? 401 : 400);
      const email = JSON.parse(text) as string;
      let mailSent = false;
      if (body.approve) {
        // Supabase verschickt die übliche Anmeldemail mit Code und Knopf
        const otp = await fetch(`${base}/auth/v1/otp?redirect_to=${encodeURIComponent(appUrl)}`, {
          method: "POST",
          headers: { apikey: anon, "Content-Type": "application/json" },
          body: JSON.stringify({ email, create_user: true }),
        });
        mailSent = otp.ok;
        if (!otp.ok) console.log("zugang: Code-Mail fehlgeschlagen", otp.status, (await otp.text()).slice(0, 200));
      }
      return json({ ok: true, email, mail_sent: mailSent });
    }

    return json({ error: "unknown_action" }, 400);
  });
}
