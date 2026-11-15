import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { siteUrl } from "@/lib/env";
import { annualised, pct, usd } from "@/lib/format";
import { blockedCountries } from "@/lib/eligibility";
import type { Project } from "@/lib/types";

const RISK_LINE = "Capital at risk. You can lose all the money you invest. Not a bank deposit.";

/** Sends through Resend (https://resend.com). No-op when RESEND_API_KEY is unset. */
export async function sendEmail(to: string[], subject: string, html: string): Promise<number> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!key || !from || to.length === 0) return 0;
  let sent = 0;
  // One message per recipient so addresses are never exposed to each other.
  for (let i = 0; i < to.length; i += 100) {
    const batch = to.slice(i, i + 100).map((addr) => ({ from, to: [addr], subject, html }));
    const res = await fetch("https://api.resend.com/emails/batch", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify(batch),
    });
    if (!res.ok) throw new Error(`Resend error ${res.status}: ${await res.text()}`);
    sent += batch.length;
  }
  return sent;
}

async function postTelegram(text: string): Promise<boolean> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chat = process.env.TELEGRAM_CHANNEL_ID;
  if (!token || !chat) return false;
  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chat, text, parse_mode: "HTML", disable_web_page_preview: false }),
  });
  if (!res.ok) throw new Error(`Telegram error ${res.status}: ${await res.text()}`);
  return true;
}

async function postDiscord(content: string): Promise<boolean> {
  const hook = process.env.DISCORD_WEBHOOK_URL;
  if (!hook) return false;
  const res = await fetch(hook, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content }),
  });
  if (!res.ok) throw new Error(`Discord error ${res.status}: ${await res.text()}`);
  return true;
}

export type AnnounceResult = { emails: number; telegram: boolean; discord: boolean; errors: string[] };

/**
 * Tells people who asked to hear about new deals: opted-in investors by email,
 * plus HyFin's own Telegram channel and Discord server. It only posts to
 * channels you own and to people who opted in.
 */
export async function announceProject(p: Project): Promise<AnnounceResult> {
  const url = `${siteUrl()}/projects/${p.slug}`;
  const terms = `${usd(p.target_amount)} raise, ${pct(p.return_pct)} for ${p.term_days} days (${pct(
    annualised(p.return_pct, p.term_days),
  )} annualised, simple)`;
  const result: AnnounceResult = { emails: 0, telegram: false, discord: false, errors: [] };

  try {
    const db = createAdminClient();
    const { data } = await db
      .from("profiles")
      .select("email, country")
      .eq("notify_new_projects", true)
      .neq("kyc", "rejected");
    const blocked = blockedCountries();
    const recipients = (data ?? []).filter((r) => !r.country || !blocked.includes(r.country)).map((r) => r.email);
    result.emails = await sendEmail(
      recipients,
      `New deal open: ${p.title}`,
      `<h2>${escapeHtml(p.title)}</h2>
       <p>${escapeHtml(p.summary)}</p>
       <p><strong>${terms}</strong></p>
       <p><a href="${url}">See the deal</a></p>
       <p style="color:#666;font-size:13px">${RISK_LINE}<br/>
       You get these emails because new-deal alerts are on in your HyFin profile.
       <a href="${siteUrl()}/dashboard/profile">Turn them off</a>.</p>`,
    );
  } catch (e) {
    result.errors.push(String(e));
  }

  try {
    result.telegram = await postTelegram(
      `<b>New deal open: ${escapeHtml(p.title)}</b>\n${escapeHtml(p.summary)}\n\n${terms}\n${url}\n\n<i>${RISK_LINE}</i>`,
    );
  } catch (e) {
    result.errors.push(String(e));
  }

  try {
    result.discord = await postDiscord(`**New deal open: ${p.title}**\n${p.summary}\n\n${terms}\n${url}\n\n*${RISK_LINE}*`);
  } catch (e) {
    result.errors.push(String(e));
  }
  return result;
}

function escapeHtml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
