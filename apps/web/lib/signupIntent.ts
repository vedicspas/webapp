const COOKIE = "veda_signup_intent";

export type SignupRole = "visitor" | "vendor";

export function setSignupIntent(role: SignupRole): void {
  document.cookie = `${COOKIE}=${role}; Path=/; Max-Age=600; SameSite=Lax`;
}

/** Remember that this browser session started from "List a spa". */
export function setVendorSignupIntent(): void {
  setSignupIntent("vendor");
}

export function signupRoleFromSearch(intent: string | null): SignupRole {
  return intent === "vendor" ? "vendor" : "visitor";
}

export function vendorIntentFromSearch(intent: string | null): "vendor" | undefined {
  return intent === "vendor" ? "vendor" : undefined;
}
