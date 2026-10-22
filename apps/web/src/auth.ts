import NextAuth from "next-auth";
import type { JWT } from "next-auth/jwt";
import Keycloak from "next-auth/providers/keycloak";
import { z } from "zod";

const refreshResponseSchema = z.object({
  access_token: z.string(),
  refresh_token: z.string().optional(),
  expires_in: z.number(),
});

/** Exchanges the refresh token for a new access token (Keycloak access tokens live ~5 min). */
async function refreshAccessToken(token: JWT): Promise<JWT> {
  if (!token.refreshToken) return { ...token, error: "RefreshTokenError" };

  const response = await fetch(
    `${process.env.AUTH_KEYCLOAK_ISSUER}/protocol/openid-connect/token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        client_id: process.env.AUTH_KEYCLOAK_ID ?? "",
        client_secret: process.env.AUTH_KEYCLOAK_SECRET ?? "",
        refresh_token: token.refreshToken,
      }),
    },
  );
  if (!response.ok) return { ...token, error: "RefreshTokenError" };

  const refreshed = refreshResponseSchema.parse(await response.json());
  return {
    ...token,
    accessToken: refreshed.access_token,
    refreshToken: refreshed.refresh_token ?? token.refreshToken,
    expiresAt: Math.floor(Date.now() / 1000) + refreshed.expires_in,
    error: undefined,
  };
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [Keycloak],
  callbacks: {
    async jwt({ token, account }) {
      if (account) {
        return {
          ...token,
          accessToken: account.access_token,
          refreshToken: account.refresh_token,
          idToken: account.id_token,
          expiresAt: account.expires_at,
        };
      }
      const stillValid = token.expiresAt && Date.now() < (token.expiresAt - 10) * 1000;
      return stillValid ? token : refreshAccessToken(token);
    },
    session({ session, token }) {
      // The access token deliberately stays out of the session: it is read
      // server-side only (see lib/api.ts) and never sent to the browser.
      if (token.error) session.error = token.error;
      return session;
    },
  },
});
