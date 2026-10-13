import nodemailer from "nodemailer";

/**
 * Sends the contact-form notice to the Site Settings inbox.
 * Returns "skipped" when SMTP is not configured so the form can still save.
 */
export async function sendContactNotification(opts: {
  to: string;
  fromName: string;
  fromEmail: string;
  phone: string;
  subject: string;
  message: string;
}): Promise<"sent" | "skipped"> {
  const host = process.env.SMTP_HOST?.trim();
  if (!host) return "skipped";

  const port = Number(process.env.SMTP_PORT ?? "587");
  const user = process.env.SMTP_USER?.trim();
  const pass = process.env.SMTP_PASS;
  const from = process.env.SMTP_FROM?.trim() || user || opts.to;

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: user && pass ? { user, pass } : undefined,
  });

  await transporter.sendMail({
    from,
    to: opts.to,
    replyTo: `"${opts.fromName.replace(/"/g, "")}" <${opts.fromEmail}>`,
    subject: `[AyurvedaAdvisor.com] ${opts.subject}`,
    text: [
      `Name: ${opts.fromName}`,
      `Email: ${opts.fromEmail}`,
      `Phone: ${opts.phone}`,
      "",
      opts.message,
    ].join("\n"),
  });
  return "sent";
}
