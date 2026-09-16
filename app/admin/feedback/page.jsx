/* What readers said about paragraphs.
 *
 * Nothing here is displayed on the site, whatever a reader permitted: the
 * visibility column records consent, and showing any of it is a separate
 * decision with its own surface. What this page is for is reading them, and
 * saying which have been acted on. */
import { feedback } from "../../lib/admin-data.mjs";
import { Outcome, When } from "../parts.jsx";

const NEXT = {
  new: ["read", "declined"],
  read: ["actioned", "declined"],
  actioned: ["read"],
  declined: ["read"],
};

const THUMB = { up: "thumb up", down: "thumb down" };

const SHOWN = {
  private: "private",
  anonymous: "may be shown, unnamed",
  attributed: "may be shown, named",
};

/* A link that opens the reader at the paragraph, the way a copied link does. */
function readerLink(row) {
  const query = new URLSearchParams({ passage: row.locator });
  if (row.publication_id) query.set("publication", row.publication_id);
  return `/spec-reader/?${query}`;
}

export default async function Feedback({ searchParams }) {
  const params = await searchParams;
  const rows = await feedback();
  const waiting = rows.filter(row => row.status === "new").length;

  return (
    <section>
      <h2>Notes</h2>
      <p className="why">
        What readers said about single paragraphs, through the dialog in the spec
        reader. None of it is shown on the site: the visibility column is what a
        reader permitted, not what has been published. A note sent without
        touching any control arrives anonymous, meaning it may be shown,
        unnamed; private is a deliberate opt-out. {waiting} waiting to be read.
      </p>
      <Outcome done={params?.done} problem={params?.problem} />

      {rows.length === 0 ? <p className="empty">Nobody has said anything yet.</p> : (
        <table>
          <thead>
            <tr>
              <th>Arrived</th><th>Paragraph</th><th>Said</th><th>May be shown</th>
              <th>State</th><th>Do</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(row => (
              <tr key={row.id}>
                <td>
                  <When at={row.created_at} />
                  <br />
                  <span className="mono" style={{ color: "var(--faint)" }}>
                    {row.submitter}
                  </span>
                </td>
                <td style={{ maxWidth: "30ch" }}>
                  <a className="mono" href={readerLink(row)}>{row.locator}</a>
                  {row.behaviours?.length > 0 && (
                    <div style={{ color: "var(--faint)", marginTop: 4 }}>
                      {row.behaviours.join(", ")}
                    </div>
                  )}
                </td>
                <td style={{ maxWidth: "42ch" }}>
                  {row.vote && (
                    <div className="mono" style={{ marginBottom: 4 }}>{THUMB[row.vote]}</div>
                  )}
                  {row.comment}
                </td>
                <td>
                  {SHOWN[row.visibility] || row.visibility}
                  {row.display_name && (
                    <>
                      <br />
                      <span style={{ color: "var(--faint)" }}>as {row.display_name}</span>
                    </>
                  )}
                </td>
                <td><span className={`state ${row.status === "new" ? "pending" : "done"}`}>
                  {row.status}
                </span></td>
                <td>
                  {(NEXT[row.status] || []).map(to => (
                    <form key={to} method="post" action="/api/admin/feedback">
                      <input type="hidden" name="feedback_id" value={row.id} />
                      <input type="hidden" name="status" value={to} />
                      <button className="quiet" type="submit">{to}</button>
                    </form>
                  ))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
