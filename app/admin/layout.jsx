/* The gate, and the bar every page wears.
 *
 * The check here keeps a page from rendering without a session. It is not the
 * only check: every mutating route calls requireOperator again, because a route
 * is reachable without its page and a layout proves nothing about a POST. */
import { redirect } from "next/navigation";
import { signOut } from "../auth.mjs";
import { requireOperator } from "../auth.mjs";

export const metadata = { title: "Admin · AI Character Index" };
export const dynamic = "force-dynamic";   // a session is not a cacheable thing

const PAGES = [
  ["/admin", "Overview"],
  ["/admin/behaviours", "Behaviours"],
  ["/admin/specifications", "Specifications"],
  ["/admin/runs", "Runs"],
  ["/admin/publications", "Publications"],
];

export default async function AdminLayout({ children }) {
  const who = await requireOperator();
  if (who.response) redirect("/signin");

  return (
    <>
      <header className="bar">
        <h1>Index admin</h1>
        <nav>
          {PAGES.map(([href, label]) => (
            <a key={href} href={href}>{label}</a>
          ))}
          <a href="/spec-reader/">Reader</a>
        </nav>
        <span className="who">
          {who.email}
          {" · "}
          <form
            style={{ display: "inline" }}
            action={async () => {
              "use server";
              await signOut({ redirectTo: "/signin" });
            }}
          >
            <button className="quiet" type="submit"
                    style={{ border: 0, padding: 0, font: "inherit" }}>sign out</button>
          </form>
        </span>
      </header>
      <main>{children}</main>
    </>
  );
}
