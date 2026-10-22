import "next-auth";
import "next-auth/jwt";

declare module "next-auth" {
  interface Session {
    error?: "RefreshTokenError";
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    accessToken?: string;
    refreshToken?: string;
    /** Sent to Keycloak as `id_token_hint` when signing out. */
    idToken?: string;
    /** Access token expiry, in seconds since epoch. */
    expiresAt?: number;
    error?: "RefreshTokenError";
  }
}
