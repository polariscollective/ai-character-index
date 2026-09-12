/* What arrived through the public form.
 *
 * Reading a proposal is not registering it. The operator retypes what they
 * accept into the registration form, which is the moment a stranger's words
 * become the index's, and it is deliberate rather than a missing button. */
import { submissions } from "../../lib/admin-data.mjs";
import { Outcome, When } from "../parts.jsx";

const NEXT = {
  new: ["reviewing", "declined"],
  reviewing: ["accepted", "declined"],
  accepted: ["reviewing"],
  declined: ["reviewing"],
};

export default async function Submissions({ searchParams }) {
  const params = await searchParams;
  const rows = await submissions();
  const waiting = rows.filter(row => row.status === "new").length;

  return (
    <section>
      <h2>Proposals</h2>
      <p className="why">
        Sent through the public form by people outside the collective. Nothing here
        has been judged or registered, and marking one accepted registers nothing
        either: it says you have acted on it. {waiting} waiting to be read.
      </p>
      <Outcome done={params?.done} problem={params?.problem} />

      {rows.length === 0 ? <p className="empty">Nobody has proposed anything.</p> : (
        <table>
          <thead>
            <tr>
              <th>Arrived</th><th>What</th><th>Said</th><th>State</th><th>Do</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(row => (
              <tr key={row.id}>
                <td>
                  <When at={row.created_at} />
                  <br />
                  <span className="mono" style={{ color: "var(--faint)" }}>
                    {row.submitter || "no address"}
                  </span>
                </td>
                <td className="mono">
                  {row.kind}
                  {row.link && (
                    <>
                      <br />
                      <a href={row.link}>the document</a>
                    </>
                  )}
                </td>
                <td style={{ maxWidth: "42ch" }}>
                  {Object.entries(row.proposal || {})
                    .filter(([, value]) => value)
                    .map(([field, value]) => (
                      <div key={field} style={{ marginBottom: 4 }}>
                        <span style={{ color: "var(--faint)" }}>{field}: </span>
                        {String(value)}
                      </div>
                    ))}
                </td>
                <td><span className={`state ${row.status === "new" ? "pending" : "done"}`}>
                  {row.status}
                </span></td>
                <td>
                  {(NEXT[row.status] || []).map(to => (
                    <form key={to} method="post" action="/api/admin/submissions">
                      <input type="hidden" name="submission_id" value={row.id} />
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
