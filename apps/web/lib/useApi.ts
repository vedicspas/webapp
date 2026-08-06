"use client";

import { useCallback } from "react";
import { useSession } from "next-auth/react";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4100";

/** Authenticated fetch helper for client components. */
export function useApi() {
  const { data: session, status } = useSession();
  const token = session?.apiToken;

  const call = useCallback(
    async <T>(path: string, options: { method?: string; body?: unknown } = {}): Promise<T> => {
      const res = await fetch(`${API_URL}${path}`, {
        method: options.method ?? "GET",
        headers: {
          ...(options.body !== undefined ? { "content-type": "application/json" } : {}),
          ...(token ? { authorization: `Bearer ${token}` } : {}),
        },
        body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as { error?: string }).error ?? `Request failed (${res.status})`);
      return data as T;
    },
    [token]
  );

  return { call, token, authStatus: status };
}
