"use client";

import { useCallback } from "react";
import { useSession } from "next-auth/react";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4100";

export class ApiError extends Error {
  readonly status: number;
  readonly body: Record<string, unknown>;

  constructor(status: number, body: Record<string, unknown>) {
    const message = typeof body.error === "string" ? body.error : `Request failed (${status})`;
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
    Object.setPrototypeOf(this, ApiError.prototype);
    Object.defineProperties(this, {
      status: { value: status, enumerable: true, writable: false },
      body: { value: body, enumerable: true, writable: false },
    });
  }
}

/** Authenticated fetch helper for client components. */
export function useApi() {
  const { data: session, status } = useSession();
  const token = session?.apiToken;

  const call = useCallback(
    async <T>(path: string, options: { method?: string; body?: unknown } = {}): Promise<T> => {
      const isForm = typeof FormData !== "undefined" && options.body instanceof FormData;
      const res = await fetch(`${API_URL}${path}`, {
        method: options.method ?? "GET",
        headers: {
          ...(options.body !== undefined && !isForm ? { "content-type": "application/json" } : {}),
          ...(token ? { authorization: `Bearer ${token}` } : {}),
        },
        body: options.body === undefined ? undefined : isForm ? (options.body as FormData) : JSON.stringify(options.body),
      });
      const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      if (!res.ok) throw new ApiError(res.status, data);
      return data as T;
    },
    [token]
  );

  return { call, token, authStatus: status };
}
