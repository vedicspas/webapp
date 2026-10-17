import nodemailer from "nodemailer";
import { SignJWT, jwtVerify } from "jose";
import { execute, queryOne } from "../db/pool.js";
import { config } from "../config.js";

export const EMAIL_TYPES = [
  "welcome_vendor",
  "welcome_user",
  "password_updated",
  "password_reset",
  "clinic_submitted",
  "appointment_confirmed",
  "appointment_requested",
  "review_received",
  "reply_notice",
  "clinic_question",
  "clinic_approved",
  "contact_notification",
  "claim_otp",
  "claim_received",
  "claim_admin_notice",
  "claim_approved",
  "claim_rejected",
  "patient_interest",
] as const;

export type EmailType = (typeof EMAIL_TYPES)[number];

export const EMAIL_TYPE_LABELS: Record<EmailType, string> = {
  welcome_vendor: "Welcome (clinic owner)",
  welcome_user: "Welcome (user)",
  password_updated: "Password updated",
  password_reset: "Password reset",
  clinic_submitted: "Clinic submitted",
  appointment_confirmed: "Appointment confirmation",
  appointment_requested: "Appointment request",
  review_received: "Review received",
  reply_notice: "Reply notice",
  clinic_question: "New clinic question",
  clinic_approved: "Clinic approved",
  contact_notification: "Contact form",
  claim_otp: "Claim verification code",
  claim_received: "Claim request received",
  claim_admin_notice: "New claim request",
  claim_approved: "Claim approved",
  claim_rejected: "Claim rejected",
  patient_interest: "New patient interest",
};

const SECURITY_TYPES: EmailType[] = ["password_reset", "password_updated", "claim_otp"];
const ONCE_PER_DAY: EmailType[] = ["reply_notice"];
const secret = new TextEncoder().encode(config.authSecret);

export function smtpConfigured(): boolean {
  return Boolean(process.env.SMTP_HOST?.trim());
}

export function firstName(name: string | null | undefined, email?: string): string {
  const token = (name ?? "").trim().split(/\s+/)[0];
  if (token) return token;
  const local = (email ?? "").split("@")[0];
  return local || "there";
}

export function siteUrl(path: string): string {
  return new URL(path, config.webOrigin).href;
}

export async function signEmailToken(purpose: "unsub" | "pwd-reset", email: string, expires: string): Promise<string> {
  return new SignJWT({ purpose, email })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(expires)
    .sign(secret);
}

export async function readEmailToken(
  token: string,
  purpose: "unsub" | "pwd-reset"
): Promise<string | null> {
  try {
    const { payload } = await jwtVerify(token, secret);
    if (payload.purpose !== purpose) return null;
    const email = String(payload.email ?? "").trim().toLowerCase();
    return email || null;
  } catch {
    return null;
  }
}

async function isUnsubscribed(email: string): Promise<boolean> {
  const row = await queryOne("SELECT email FROM email_unsubscribes WHERE email = ?", [email.toLowerCase()]);
  return Boolean(row);
}

export async function addUnsubscribe(email: string): Promise<void> {
  await execute("INSERT IGNORE INTO email_unsubscribes (email) VALUES (?)", [email.toLowerCase()]);
}

async function alreadySentToday(type: EmailType, toEmail: string): Promise<boolean> {
  const row = await queryOne(
    `SELECT id FROM email_log
     WHERE email_type = ? AND to_email = ? AND status = 'sent'
       AND sent_at >= UTC_DATE()
     LIMIT 1`,
    [type, toEmail.toLowerCase()]
  );
  return Boolean(row);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function nlHtml(value: string): string {
  return escapeHtml(value)
    .replace(/\n/g, "<br>")
    .replace(
      /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g,
      '<a href="$2" style="color:#1a73e8;text-decoration:underline;">$1</a>'
    );
}

function stripMarkdownLinks(value: string): string {
  return value.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, "$1 ($2)");
}

export function renderEmail(opts: {
  firstName: string;
  paragraphs: string[];
  actionLabel?: string;
  actionUrl?: string;
  unsubscribeUrl?: string | null;
}): { html: string; text: string } {
  const greeting = `Hi ${opts.firstName},`;
  const signoff = "Warm regards,\nThe AyurvedaAdvisor.com Team";
  const logo = siteUrl("/logo-ayurvedaadvisor-email.svg");
  const button =
    opts.actionLabel && opts.actionUrl
      ? `<p style="margin:28px 0 8px;"><a href="${escapeHtml(opts.actionUrl)}" style="display:inline-block;background:#1a73e8;color:#ffffff;font-size:15px;font-weight:bold;text-decoration:none;padding:12px 22px;border-radius:4px;">${escapeHtml(opts.actionLabel)}</a></p>
         <p style="margin:0 0 24px;font-size:12px;line-height:1.5;color:#667;word-break:break-all;overflow-wrap:anywhere;word-wrap:break-word;"><a href="${escapeHtml(opts.actionUrl)}" style="color:#667;text-decoration:none;word-break:break-all;overflow-wrap:anywhere;word-wrap:break-word;">${escapeHtml(opts.actionUrl)}</a></p>`
      : "";
  const unsub = opts.unsubscribeUrl
    ? `<p style="margin:32px 0 0;font-size:12px;line-height:1.5;color:#888;">You received this email because you have an AyurvedaAdvisor.com account.<br>
       <a href="${escapeHtml(opts.unsubscribeUrl)}" style="color:#888;">Unsubscribe</a></p>`
    : "";

  const html = `<!DOCTYPE html>
<html><body style="margin:0;padding:0;background:#f4f6f8;font-family:Arial,Helvetica,sans-serif;color:#1f2933;overflow-x:hidden;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f8;padding:24px 12px;table-layout:fixed;">
    <tr><td align="center">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#ffffff;border:1px solid #e6e8eb;padding:32px 28px;table-layout:fixed;">
        <tr><td style="overflow-wrap:break-word;word-break:break-word;">
          <img src="${escapeHtml(logo)}" alt="AyurvedaAdvisor.com" height="40" style="height:40px;width:auto;max-width:100%;display:block;margin-bottom:24px;">
          <p style="margin:0 0 16px;font-size:16px;">${escapeHtml(greeting)}</p>
          ${opts.paragraphs.map((p) => `<p style="margin:0 0 16px;font-size:15px;line-height:1.55;">${nlHtml(p)}</p>`).join("")}
          ${button}
          <p style="margin:24px 0 0;font-size:15px;line-height:1.55;">${nlHtml(signoff)}</p>
          ${unsub}
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;

  const textParts = [greeting, "", ...opts.paragraphs.map(stripMarkdownLinks), ""];
  if (opts.actionLabel && opts.actionUrl) {
    textParts.push(`${opts.actionLabel}:`, opts.actionUrl, "");
  }
  textParts.push(signoff);
  if (opts.unsubscribeUrl) {
    textParts.push("", "You received this email because you have an AyurvedaAdvisor.com account.", `Unsubscribe: ${opts.unsubscribeUrl}`);
  }
  return { html, text: textParts.join("\n") };
}

export async function sendTransactional(opts: {
  type: EmailType;
  to: string;
  subject: string;
  firstName: string;
  paragraphs: string[];
  actionLabel?: string;
  actionUrl?: string;
}): Promise<"sent" | "skipped" | "failed"> {
  const to = opts.to.trim().toLowerCase();
  if (!to) return "skipped";

  if (ONCE_PER_DAY.includes(opts.type) && (await alreadySentToday(opts.type, to))) {
    return "skipped";
  }

  const allowUnsub = !SECURITY_TYPES.includes(opts.type) && opts.type !== "contact_notification";
  const unsubscribed = allowUnsub && (await isUnsubscribed(to));

  let unsubscribeUrl: string | null = null;
  if (allowUnsub && !unsubscribed) {
    const token = await signEmailToken("unsub", to, "365d");
    unsubscribeUrl = siteUrl(`/unsubscribe?token=${encodeURIComponent(token)}`);
  }

  const { html, text } = renderEmail({
    firstName: opts.firstName,
    paragraphs: opts.paragraphs,
    actionLabel: opts.actionLabel,
    actionUrl: opts.actionUrl,
    unsubscribeUrl,
  });

  const from = process.env.SMTP_FROM?.trim() || process.env.SMTP_USER?.trim() || "AyurvedaAdvisor.com <noreply@ayurvedaadvisor.com>";
  let status: "sent" | "skipped" | "failed" = "skipped";
  let error: string | null = unsubscribed
    ? "unsubscribed"
    : smtpConfigured()
      ? null
      : "smtp_not_configured";

  if (!unsubscribed && smtpConfigured()) {
    try {
      const port = Number(process.env.SMTP_PORT ?? "587");
      const user = process.env.SMTP_USER?.trim();
      const pass = process.env.SMTP_PASS;
      const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST!.trim(),
        port,
        secure: port === 465,
        auth: user && pass ? { user, pass } : undefined,
      });
      await transporter.sendMail({ from, to, subject: opts.subject, html, text });
      status = "sent";
      error = null;
    } catch (err) {
      status = "failed";
      error = err instanceof Error ? err.message.slice(0, 500) : "send_failed";
    }
  }

  await execute(
    `INSERT INTO email_log (email_type, to_email, from_email, subject, html_body, text_body, status, error)
     VALUES (?,?,?,?,?,?,?,?)`,
    [opts.type, to, from, opts.subject, html, text, status, error]
  );
  return status;
}
