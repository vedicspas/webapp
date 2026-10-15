import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/** Live site only. Localhost and Railway *.up.railway.app are left alone. */
const APEX_HOST = "ayurvedaadvisor.com";
const WWW_HOST = "www.ayurvedaadvisor.com";

function requestHost(request: NextRequest): string {
  return (request.headers.get("host") ?? "").split(":")[0].toLowerCase();
}

function forwardedProto(request: NextRequest): string {
  const raw =
    request.headers.get("x-forwarded-proto") ??
    request.nextUrl.protocol.replace(":", "");
  return raw.split(",")[0].trim().toLowerCase();
}

export function middleware(request: NextRequest) {
  const host = requestHost(request);
  if (host !== APEX_HOST && host !== WWW_HOST) return NextResponse.next();

  const toWww = host === APEX_HOST;
  const toHttps = forwardedProto(request) !== "https";
  if (!toWww && !toHttps) return NextResponse.next();

  const path = `${request.nextUrl.pathname}${request.nextUrl.search}`;
  return NextResponse.redirect(`https://${WWW_HOST}${path}`, 308);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};
