import { firstName, sendTransactional } from "./mailer.js";

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
  const result = await sendTransactional({
    type: "contact_notification",
    to: opts.to,
    subject: `[AyurvedaAdvisor.com] ${opts.subject}`,
    firstName: firstName(opts.to.split("@")[0], opts.to),
    paragraphs: [
      `Name: ${opts.fromName}`,
      `Email: ${opts.fromEmail}`,
      `Phone: ${opts.phone}`,
      opts.message,
    ],
  });
  return result === "sent" ? "sent" : "skipped";
}
