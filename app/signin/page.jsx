/* The one screen someone outside the collective ever sees. It says what this is
   and that the list is the gate, and it does not explain how to get on it. */
import { redirect } from "next/navigation";
import { auth, misconfigured, signIn } from "../auth.mjs";
import { isAllowedEmail } from "../lib/allowed-email.mjs";

export const metadata = { title: "Sign in · AI Character Index" };

export default async function SignIn({ searchParams }) {
  const params = await searchParams;
  // The same development door requireOperator opens: with it set, there is nothing
  // to sign in to.
  if (process.env.NODE_ENV !== "production" && process.env.ACI_DEV_OPERATOR) {
    redirect("/admin");
  }
  const session = await auth();
  if (session?.user?.email && isAllowedEmail(session.user.email)) redirect("/admin");

  const missing = misconfigured();
  // AccessDenied is the refusal this application raises; everything else is
  // Auth.js's own, and saying which would only be noise to the person reading it.
  const refused = params?.error === "AccessDenied";

  return (
    <main className="door">
      <h1>AI Character Index</h1>
      <p>
        The operating surface of the index: the registry, the runs, and what the
        public reader shows. Reading the index needs none of this. The reader is
        open at <a href="/spec-reader/">/spec-reader/</a>.
      </p>

      {missing && (
        <div className="notice bad">
          <p>Sign-in is not configured on this deployment.</p>
          <p className="mono">missing: {missing.join(", ")}</p>
        </div>
      )}

      {refused && (
        <div className="notice bad">
          <p>That account is not on the list.</p>
        </div>
      )}

      <form
        action={async () => {
          "use server";
          await signIn("google", { redirectTo: "/admin" });
        }}
      >
        <button type="submit" disabled={Boolean(missing)}>Continue with Google</button>
      </form>
    </main>
  );
}
