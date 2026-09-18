import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import { cookies } from "next/headers";
import type { SessionUser } from "@vedic/shared";

const API_URL =
  process.env.API_URL_INTERNAL ??
  process.env.NEXT_PUBLIC_API_URL ??
  "http://localhost:4100";

declare module "next-auth" {
  interface Session {
    apiToken: string;
    appUser: SessionUser;
    isNewAccount?: boolean;
  }
}

interface ApiSession {
  user: SessionUser;
  apiToken: string;
  created?: boolean;
}

async function apiAuth(path: string, body: unknown): Promise<ApiSession | null> {
  try {
    const res = await fetch(`${API_URL}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    // API unreachable (container down, wrong URL, etc.) — treat as failed login
    // so the sign-in page can distinguish this from a bad password.
    return null;
  }
}

const providers = [
  Credentials({
    credentials: { email: { label: "Email" }, password: { label: "Password", type: "password" } },
    authorize: async (credentials) => {
      const result = await apiAuth("/auth/login", {
        email: credentials?.email,
        password: credentials?.password,
      });
      if (!result) return null;
      return {
        id: String(result.user.id),
        email: result.user.email,
        name: result.user.name,
        image: result.user.avatarUrl,
        apiSession: result,
      };
    },
  }),
];

if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  providers.push(
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    }) as never
  );
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  secret: process.env.AUTH_SECRET,
  trustHost: true,
  session: { strategy: "jwt" },
  pages: { signIn: "/auth/signin" },
  providers,
  callbacks: {
    async jwt({ token, user, account, profile, trigger, session }) {
      if (trigger === "update" && session) {
        const next = session as { apiToken?: string; appUser?: SessionUser; isNewAccount?: boolean };
        if (next.apiToken) token.apiToken = next.apiToken;
        if (next.appUser) token.appUser = next.appUser;
        if (typeof next.isNewAccount === "boolean") token.isNewAccount = next.isNewAccount;
        return token;
      }
      // Credentials login: the authorize() result carries the API session.
      const apiSession = (user as { apiSession?: ApiSession } | undefined)?.apiSession;
      if (apiSession) {
        token.apiToken = apiSession.apiToken;
        token.appUser = apiSession.user;
        token.isNewAccount = Boolean(apiSession.created);
      }
      // Google login: upsert the user in our API and store its token.
      if (account?.provider === "google" && profile?.email) {
        let intent: "vendor" | "visitor" = "visitor";
        try {
          const jar = await cookies();
          const intentCookie = jar.get("veda_signup_intent")?.value;
          if (intentCookie === "vendor") intent = "vendor";
        } catch {
          // Cookie store unavailable in this runtime; treat as visitor.
        }
        const result = await apiAuth("/auth/oauth", {
          email: profile.email,
          name: profile.name ?? profile.email,
          avatarUrl: typeof profile.picture === "string" ? profile.picture : null,
          intent,
        });
        if (result) {
          token.apiToken = result.apiToken;
          token.appUser = result.user;
          token.isNewAccount = Boolean(result.created);
        }
      }
      return token;
    },
    async session({ session, token }) {
      session.apiToken = (token.apiToken as string) ?? "";
      session.appUser = token.appUser as SessionUser;
      session.isNewAccount = Boolean(token.isNewAccount);
      return session;
    },
  },
});
