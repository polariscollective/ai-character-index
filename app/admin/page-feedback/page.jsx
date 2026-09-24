/* What readers said about whole pages, with the page attached.
 *
 * None of it is shown on the site and none of it ever will be: a capture of
 * somebody's browser is private, which is what the form promised. What this
 * page is for is reading them, opening the picture, and saying which have been
 * acted on. */
import { pageFeedback } from "../../lib/admin-data.mjs";
import { Outcome, When } from "../parts.jsx";

const NEXT = {
  new: ["read", "declined"],
  read: ["actioned", "declined"],
  actioned: ["read"],
  declined: ["read"],
};

export default async function PageFeedback({ searchParams }) {
  const params = await searchParams;
  const rows = await pageFeedback();
  const waiting = rows.filter(row => row.status === "new").length;

  return (
    <section>
      <h2>Page reports</h2>
      <p className="why">
        What readers said about a whole page, through the bubble at the bottom
        right of the public pages. Each one may carry a capture of what they
        were looking at, annotated. None of it is shown on the site: the form
        says it stays private. {waiting} waiting to be read.
      </p>
      <Outcome done={params?.done} problem={params?.problem} />

      {rows.length === 0 ? <p className="empty">Nobody has reported anything yet.</p> : (
        <table>
          <thead>
            <tr>
              <th>Arrived</th><th>Page</th><th>Said</th><th>Saw</th>
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
                <td style={{ maxWidth: "28ch" }}>
                  <a className="mono" href={row.page_url}>{row.page_url}</a>
                  <div className="mono" style={{ color: "var(--faint)", marginTop: 4 }}>
                    {row.viewport}
                  </div>
                </td>
                <td style={{ maxWidth: "40ch" }}>{row.comment}</td>
                <td>
                  {row.link
                    ? (
                      <a href={row.link} target="_blank" rel="noopener noreferrer">
                        <img src={row.link} alt="the page as the sender saw it"
                             style={{ display: "block", width: 160, height: "auto",
                                      border: "1px solid var(--muted)" }} />
                      </a>
                      )
                    : <span className="empty">no capture</span>}
                </td>
                <td><span className={`state ${row.status === "new" ? "pending" : "done"}`}>
                  {row.status}
                </span></td>
                <td>
                  {(NEXT[row.status] || []).map(to => (
                    <form key={to} method="post" action="/api/admin/page-feedback">
                      <input type="hidden" name="report_id" value={row.id} />
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
