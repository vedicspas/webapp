import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import type { SessionUser } from "@vedic/shared";

const API_URL =
  process.env.API_URL_INTERNAL ??
  process.env.NEXT_PUBLIC_API_URL ??
  "http://localhost:4100";

declare module "next-auth" {
  interface Session {
    apiToken: string;
    appUser: SessionUser;
  }
}

interface ApiSession {
  user: SessionUser;
  apiToken: string;
}

async function apiAuth(path: string, body: unknown): Promise<ApiSession | null> {
  const res = await fetch(`${API_URL}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) return null;
  return res.json();
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
  session: { strategy: "jwt" },
  pages: { signIn: "/auth/signin" },
  providers,
  callbacks: {
    async jwt({ token, user, account, profile }) {
      // Credentials login: the authorize() result carries the API session.
      const apiSession = (user as { apiSession?: ApiSession } | undefined)?.apiSession;
      if (apiSession) {
        token.apiToken = apiSession.apiToken;
        token.appUser = apiSession.user;
      }
      // Google login: upsert the user in our API and store its token.
      if (account?.provider === "google" && profile?.email) {
        const result = await apiAuth("/auth/oauth", {
          email: profile.email,
          name: profile.name ?? profile.email,
          avatarUrl: typeof profile.picture === "string" ? profile.picture : null,
        });
        if (result) {
          token.apiToken = result.apiToken;
          token.appUser = result.user;
        }
      }
      return token;
    },
    async session({ session, token }) {
      session.apiToken = (token.apiToken as string) ?? "";
      session.appUser = token.appUser as SessionUser;
      return session;
    },
  },
});
