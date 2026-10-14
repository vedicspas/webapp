const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: "$",
  EUR: "\u20ac",
  INR: "\u20b9",
  LKR: "Rs ",
  IDR: "Rp ",
};

export function money(minor: number, currency = "USD"): string {
  const symbol = CURRENCY_SYMBOLS[currency] ?? `${currency} `;
  const value = minor / 100;
  return `${symbol}${value % 1 === 0 ? value.toFixed(0) : value.toFixed(2)}`;
}

export function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function timeOfDay(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
  });
}

export const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export const PAYMENT_MODE_LABELS: Record<string, string> = {
  full_prepay: "Pay in full online",
  deposit: "Deposit online, rest at the spa",
  booking_fee: "Small booking fee, pay at the spa",
  pay_at_spa: "Free reservation, pay at the spa",
};

export function formatSpaAddress(parts: {
  addressLine?: string | null;
  cityName?: string | null;
  state?: string | null;
  postalCode?: string | null;
  countryName?: string | null;
}): string {
  return [parts.addressLine, parts.cityName, parts.state, parts.postalCode, parts.countryName]
    .map((part) => part?.trim())
    .filter((part): part is string => Boolean(part))
    .join(", ");
}

export function formatSpaLocality(parts: {
  cityName?: string | null;
  state?: string | null;
  countryName?: string | null;
}): string {
  return [parts.cityName, parts.state, parts.countryName]
    .map((part) => part?.trim())
    .filter((part): part is string => Boolean(part))
    .join(", ");
}

export function googleMapsUrl(opts: {
  lat?: number | null;
  lng?: number | null;
  address?: string | null;
}): string | null {
  if (opts.lat != null && opts.lng != null) {
    const lat = Number(opts.lat);
    const lng = Number(opts.lng);
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
    }
  }
  const q = opts.address?.trim();
  if (!q) return null;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
}

export const ON_REQUEST_LABELS: Record<"on_request" | "not_available", string> = {
  on_request: "Available on request",
  not_available: "Not available",
};
