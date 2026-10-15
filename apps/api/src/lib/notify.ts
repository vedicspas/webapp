import { queryOne } from "../db/pool.js";
import { staticCache } from "../cache/staticCache.js";
import { firstName, sendTransactional, siteUrl } from "./mailer.js";

function money(minor: number, currency = "USD"): string {
  const symbols: Record<string, string> = {
    USD: "$",
    EUR: "\u20ac",
    INR: "\u20b9",
    LKR: "Rs ",
    IDR: "Rp ",
  };
  const symbol = symbols[currency] ?? `${currency} `;
  const value = minor / 100;
  return `${symbol}${value % 1 === 0 ? value.toFixed(0) : value.toFixed(2)}`;
}

function supportEmail(): string {
  return staticCache.siteSettings.contactEmail || "hello@ayurvedaadvisor.com";
}

function formatWhen(iso: Date | string): { date: string; time: string } {
  const d = iso instanceof Date ? iso : new Date(iso);
  if (Number.isNaN(d.getTime())) return { date: String(iso), time: "" };
  const date = d.toISOString().slice(0, 10);
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  return { date, time: `${hh}:${mm} UTC` };
}

async function sendQuiet(fn: () => Promise<unknown>): Promise<void> {
  try {
    await fn();
  } catch (err) {
    console.error("email notify failed", err);
  }
}

export function notifyWelcomeUser(to: string, name: string): Promise<void> {
  return sendQuiet(() =>
    sendTransactional({
      type: "welcome_user",
      to,
      subject: "Welcome to AyurvedaAdvisor.com!",
      firstName: firstName(name, to),
      paragraphs: [
        "Welcome to AyurvedaAdvisor.com! Discover Ayurveda clinics, explore treatments, read reviews, and book an appointment.",
      ],
      actionLabel: "Explore Clinics",
      actionUrl: siteUrl("/spas"),
    })
  );
}

export function notifyWelcomeVendor(to: string, name: string): Promise<void> {
  return sendQuiet(() =>
    sendTransactional({
      type: "welcome_vendor",
      to,
      subject: "Welcome to AyurvedaAdvisor.com!",
      firstName: firstName(name, to),
      paragraphs: [
        "Welcome to AyurvedaAdvisor.com! Your account is ready, and you can now add your clinics and introduce your services to people seeking Ayurvedic care.",
      ],
      actionLabel: "Add Your Clinic",
      actionUrl: siteUrl("/vendor"),
    })
  );
}

export function notifyPasswordReset(to: string, name: string, resetUrl: string): Promise<void> {
  return sendQuiet(() =>
    sendTransactional({
      type: "password_reset",
      to,
      subject: "Reset your AyurvedaAdvisor.com password",
      firstName: firstName(name, to),
      paragraphs: [
        "We received a request to reset your password.",
        "This link expires in 30 minutes. If you didn’t request this, you can ignore this email. Your password will remain unchanged.",
      ],
      actionLabel: "Reset Password",
      actionUrl: resetUrl,
    })
  );
}

export function notifyPasswordUpdated(to: string, name: string): Promise<void> {
  return sendQuiet(() =>
    sendTransactional({
      type: "password_updated",
      to,
      subject: "Your password has been updated",
      firstName: firstName(name, to),
      paragraphs: [
        "Your AyurvedaAdvisor.com password has been changed successfully.",
        `If you didn’t make this change, please contact us immediately at ${supportEmail()}.`,
      ],
    })
  );
}

export function notifyClinicSubmitted(opts: {
  to: string;
  name: string;
  clinicName: string;
  clinicAddress: string;
  spaId: number;
}): Promise<void> {
  return sendQuiet(() =>
    sendTransactional({
      type: "clinic_submitted",
      to: opts.to,
      subject: `Clinic submitted: ${opts.clinicName}`,
      firstName: firstName(opts.name, opts.to),
      paragraphs: [
        "Your clinic has been submitted successfully:",
        `${opts.clinicName}\n${opts.clinicAddress}`.trim(),
        "Your listing is awaiting admin approval and will appear on AyurvedaAdvisor.com once approved.",
      ],
      actionLabel: "View Your Submission",
      actionUrl: siteUrl(`/vendor/spas/${opts.spaId}`),
    })
  );
}

export function notifyClinicApproved(opts: {
  to: string;
  name: string;
  clinicName: string;
  slug: string;
}): Promise<void> {
  return sendQuiet(() =>
    sendTransactional({
      type: "clinic_approved",
      to: opts.to,
      subject: `Your clinic is now live — ${opts.clinicName}`,
      firstName: firstName(opts.name, opts.to),
      paragraphs: [
        `Your listing for ${opts.clinicName} has been approved and is now live on AyurvedaAdvisor.com!`,
        "Visitors can now explore your clinic and its services.",
      ],
      actionLabel: "View Your Clinic",
      actionUrl: siteUrl(`/spas/${opts.slug}`),
    })
  );
}

export async function notifyBooking(bookingId: number): Promise<void> {
  return sendQuiet(async () => {
    const row = await queryOne<{
      code: string;
      starts_at: Date | string;
      created_at: Date | string;
      status_code: string;
      price_minor: number;
      currency_code: string;
      treatment_name: string;
      spa_name: string;
      spa_slug: string;
      address_line: string;
      city_name: string;
      state: string;
      postal_code: string;
      country_id: number | null;
      guest_email: string;
      guest_name: string;
    }>(
      `SELECT b.code, b.starts_at, b.created_at, bs.code AS status_code,
         t.price_minor, t.name AS treatment_name, c.code AS currency_code,
         s.name AS spa_name, s.slug AS spa_slug, s.address_line, s.city_name, s.state, s.postal_code, s.country_id,
         u.email AS guest_email, u.name AS guest_name
       FROM bookings b
       JOIN booking_statuses bs ON bs.id = b.status_id
       JOIN treatments t ON t.id = b.treatment_id
       JOIN spas s ON s.id = b.spa_id
       JOIN currencies c ON c.id = b.currency_id
       JOIN users u ON u.id = b.user_id
       WHERE b.id = ?`,
      [bookingId]
    );
    if (!row) return;
    const country = row.country_id ? staticCache.country(Number(row.country_id))?.name ?? "" : "";
    const address = [row.address_line, row.city_name, row.state, row.postal_code, country]
      .map((p) => (p ?? "").trim())
      .filter(Boolean)
      .join(", ");
    const appt = formatWhen(row.starts_at);
    const booked = formatWhen(row.created_at);
    const pending = row.status_code === "pending_payment";
    const cost = money(Number(row.price_minor), row.currency_code);
    await sendTransactional({
      type: pending ? "appointment_requested" : "appointment_confirmed",
      to: row.guest_email,
      subject: pending
        ? `Appointment request received — ${row.spa_name}`
        : `Appointment confirmation — ${row.spa_name}`,
      firstName: firstName(row.guest_name, row.guest_email),
      paragraphs: [
        pending
          ? "We’ve received your appointment request. The clinic still needs to confirm availability. Here are your requested appointment details:"
          : "Here are your appointment details:",
        `Clinic: ${row.spa_name}\nAddress: ${address}\nAppointment date: ${appt.date}\nAppointment time: ${appt.time}`,
        `Treatments and estimated costs:\n${row.treatment_name} — ${cost}`,
        `Booking reference: ${row.code}\nBooked on: ${booked.date}`,
        "Costs are estimates. The clinic will confirm the final treatment plan and charges.",
      ],
      actionLabel: "View Appointment",
      actionUrl: siteUrl("/account/bookings"),
    });
  });
}

export async function notifyReviewReceived(reviewId: number): Promise<void> {
  return sendQuiet(async () => {
    const row = await queryOne<{
      email: string;
      name: string;
      spa_name: string;
      slug: string;
    }>(
      `SELECT u.email, u.name, s.name AS spa_name, s.slug
       FROM reviews r JOIN users u ON u.id = r.user_id JOIN spas s ON s.id = r.spa_id
       WHERE r.id = ?`,
      [reviewId]
    );
    if (!row) return;
    await sendTransactional({
      type: "review_received",
      to: row.email,
      subject: `Thank you for reviewing ${row.spa_name}`,
      firstName: firstName(row.name, row.email),
      paragraphs: [
        `Thank you for sharing your experience with ${row.spa_name}. Your review has been submitted successfully and helps others make informed choices.`,
      ],
      actionLabel: "View Your Review",
      actionUrl: siteUrl(`/spas/${row.slug}`),
    });
  });
}

export async function notifyReplyOnReview(reviewId: number, replyAuthorId: number): Promise<void> {
  return sendQuiet(async () => {
    const row = await queryOne<{
      email: string;
      name: string;
      author_id: number;
      spa_name: string;
      slug: string;
    }>(
      `SELECT u.email, u.name, u.id AS author_id, s.name AS spa_name, s.slug
       FROM reviews r JOIN users u ON u.id = r.user_id JOIN spas s ON s.id = r.spa_id
       WHERE r.id = ?`,
      [reviewId]
    );
    if (!row || row.author_id === replyAuthorId) return;
    const responder = await userById(replyAuthorId);
    await sendTransactional({
      type: "reply_notice",
      to: row.email,
      subject: "You have a new reply on AyurvedaAdvisor.com",
      firstName: firstName(row.name, row.email),
      paragraphs: [
        `${responder?.name ?? "Someone"} replied to your review on the listing for ${row.spa_name}.`,
      ],
      actionLabel: "View Reply",
      actionUrl: siteUrl(`/spas/${row.slug}`),
    });
  });
}

export async function notifyReplyOnQuestion(questionId: number, replyAuthorId: number): Promise<void> {
  return sendQuiet(async () => {
    const row = await queryOne<{
      email: string;
      name: string;
      spa_name: string;
      slug: string;
      asker_id: number;
    }>(
      `SELECT u.email, u.name, u.id AS asker_id, s.name AS spa_name, s.slug
       FROM questions q JOIN users u ON u.id = q.user_id JOIN spas s ON s.id = q.spa_id
       WHERE q.id = ?`,
      [questionId]
    );
    if (!row || row.asker_id === replyAuthorId) return;
    const responder = await userById(replyAuthorId);
    await sendTransactional({
      type: "reply_notice",
      to: row.email,
      subject: "You have a new reply on AyurvedaAdvisor.com",
      firstName: firstName(row.name, row.email),
      paragraphs: [
        `${responder?.name ?? "Someone"} replied to your comment on the listing for ${row.spa_name}.`,
      ],
      actionLabel: "View Reply",
      actionUrl: siteUrl(`/spas/${row.slug}`),
    });
  });
}

export async function notifyClinicQuestion(questionId: number): Promise<void> {
  return sendQuiet(async () => {
    const row = await queryOne<{
      owner_email: string;
      owner_name: string;
      asker_name: string;
      asker_id: number;
      owner_id: number;
      spa_name: string;
      slug: string;
      body: string;
    }>(
      `SELECT ou.email AS owner_email, ou.name AS owner_name, ou.id AS owner_id,
         au.name AS asker_name, au.id AS asker_id,
         s.name AS spa_name, s.slug, q.body
       FROM questions q
       JOIN spas s ON s.id = q.spa_id
       JOIN vendors v ON v.id = s.vendor_id
       JOIN users ou ON ou.id = v.user_id
       JOIN users au ON au.id = q.user_id
       WHERE q.id = ?`,
      [questionId]
    );
    if (!row || row.asker_id === row.owner_id) return;
    await sendTransactional({
      type: "clinic_question",
      to: row.owner_email,
      subject: `New question about ${row.spa_name}`,
      firstName: firstName(row.owner_name, row.owner_email),
      paragraphs: [
        `${row.asker_name} asked a question about ${row.spa_name}:`,
        `“${row.body}”`,
        "Visit your clinic page to answer.",
      ],
      actionLabel: "Answer Question",
      actionUrl: siteUrl(`/spas/${row.slug}`),
    });
  });
}

export async function notifySpaOwnerForPublish(spaId: number, published: boolean): Promise<void> {
  if (!published) return;
  return sendQuiet(async () => {
    const row = await queryOne<{
      email: string;
      name: string;
      spa_name: string;
      slug: string;
    }>(
      `SELECT u.email, u.name, s.name AS spa_name, s.slug
       FROM spas s JOIN vendors v ON v.id = s.vendor_id JOIN users u ON u.id = v.user_id
       WHERE s.id = ?`,
      [spaId]
    );
    if (!row) return;
    await notifyClinicApproved({
      to: row.email,
      name: row.name,
      clinicName: row.spa_name,
      slug: row.slug,
    });
  });
}

export async function loadSpaOwner(spaId: number): Promise<{
  email: string;
  name: string;
  spaName: string;
  slug: string;
  address: string;
} | null> {
  const row = await queryOne<{
    email: string;
    name: string;
    spa_name: string;
    slug: string;
    address_line: string;
    city_name: string;
    state: string;
    postal_code: string;
    country_id: number | null;
  }>(
    `SELECT u.email, u.name, s.name AS spa_name, s.slug,
       s.address_line, s.city_name, s.state, s.postal_code, s.country_id
     FROM spas s JOIN vendors v ON v.id = s.vendor_id JOIN users u ON u.id = v.user_id
     WHERE s.id = ?`,
    [spaId]
  );
  if (!row) return null;
  const country = row.country_id ? staticCache.country(Number(row.country_id))?.name ?? "" : "";
  const address = [row.address_line, row.city_name, row.state, row.postal_code, country]
    .map((p) => (p ?? "").trim())
    .filter(Boolean)
    .join(", ");
  return { email: row.email, name: row.name, spaName: row.spa_name, slug: row.slug, address };
}

export async function userById(id: number): Promise<{ email: string; name: string } | null> {
  return queryOne("SELECT email, name FROM users WHERE id = ?", [id]);
}
