import Stripe from "stripe";
import { config } from "../config.js";

/**
 * Stripe client for the platform (Connect) account.
 * When STRIPE_SECRET_KEY is not configured (local development without keys),
 * `stripe` is null and booking payments run in "dev mode": bookings are
 * confirmed immediately without charging anything.
 */
export const stripe: Stripe | null = config.stripe.secretKey
  ? new Stripe(config.stripe.secretKey)
  : null;

export function platformFeeFor(amountMinor: number): number {
  return Math.round((amountMinor * config.stripe.platformFeeBps) / 10000);
}
