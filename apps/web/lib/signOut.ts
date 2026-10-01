"use client";

import { signOut } from "next-auth/react";

/**
 * Sign out, then navigate with a relative path.
 * Auth.js otherwise turns callbackUrl "/" into an absolute URL using the
 * server hostname — inside Docker that is the container id (e.g. http://3d00f6e0b327:3000/).
 */
export async function signOutAndGo(path = "/") {
  await signOut({ redirect: false });
  window.location.assign(path);
}
