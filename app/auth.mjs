/**
 * The portal's only door.
 *
 * Google sign-in, refused unless the address is on the list. The same shape
 * evals-playground uses, and the two rules carried over from it were each learned
 * from a failure rather than read in a guide.
 */
import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { isAllowedEmail } from "./lib/allowed-email.mjs";

/* What signing in cannot work without on a deployment. The allow-list variables
 * are deliberately not here: both empty is a valid configuration, the one that
 * lets nobody in, and it is restrictive and therefore harmless. A missing secret
 * is not -- it brings every session read down with an error that names nothing. */
const REQUIRED_IN_PRODUCTION = ["AUTH_SECRET", "AUTH_GOOGLE_ID", "AUTH_GOOGLE_SECRET"];

export const { handlers, auth, signIn, signOut } = NextAuth({
  // Behind Vercel the host the application sees is not the one it serves, and
  // Auth.js refuses the request with UntrustedHost on every session read.
  trustHost: true,
  providers: [Google],
  // Both keys. The refusal below raises AccessDenied, which extends AuthError
  // directly rather than SignInError, so Auth.js routes it to pages.error --
  // setting only pages.signIn would leave the refusal on Auth.js's own card,
  // which is the one screen someone outside the collective ever sees.
  pages: { signIn: "/signin", error: "/signin" },
  callbacks: {
    // The whole of the access control: a Google account is not enough.
    async signIn({ user }) {
      return isAllowedEmail(user?.email);
    },
  },
});

/** What is missing from the environment for sign-in to work at all. */
export function misconfigured() {
  if (process.env.NODE_ENV !== "production") return null;
  const missing = REQUIRED_IN_PRODUCTION.filter(name => !process.env[name]);
  return missing.length ? missing : null;
}

/* The operator a development machine is, with no Google application involved.
 *
 * Locked on NODE_ENV as well as the variable, the same way the local job
 * subprocess is: a variable left behind on a deployment must not open the portal
 * to the internet. Both conditions together, and neither alone.
 *
 * This exists because the alternative is worse. Without it, running the portal
 * locally needs an OAuth client registered against localhost, and the pressure to
 * test against production instead is exactly how a service key ends up on a
 * laptop doing real work by accident. */
function developmentOperator() {
  if (process.env.NODE_ENV === "production") return null;
  return process.env.ACI_DEV_OPERATOR || null;
}

/**
 * This request's operator, or a response to return as it stands.
 *
 * The access control is here and nowhere else. Every page and every route calls
 * it; a route is reachable without its page, so checking in the layout alone
 * would leave the routes open.
 */
export async function requireOperator() {
  const development = developmentOperator();
  if (development) return { email: development };

  const missing = misconfigured();
  if (missing) {
    return { response: Response.json(
      { error: `Sign-in is not configured: ${missing.join(", ")} missing from the environment.` },
      { status: 503 }) };
  }
  const session = await auth();
  const email = session?.user?.email;
  // Checked again rather than trusted: a session could outlive a change to the
  // list, and the list is the authority.
  if (!email || !isAllowedEmail(email)) {
    return { response: Response.json({ error: "not signed in" }, { status: 401 }) };
  }
  return { email };
}
