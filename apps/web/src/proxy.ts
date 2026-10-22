// Running `auth` here lets Auth.js write the refreshed tokens back to the session
// cookie: Server Components cannot set cookies, so without it the Keycloak access
// token (~5 min) goes stale in the cookie and every API call ends in a 401.
export { auth as proxy } from "@/auth";

export const config = {
  matcher: ["/((?!api/auth|_next/static|_next/image|favicon.ico).*)"],
};
