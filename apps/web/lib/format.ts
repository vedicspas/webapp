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
