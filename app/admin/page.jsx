/* What is public, what is in flight, what is registered. */
import { overview } from "../lib/admin-data.mjs";
import { Cost, Jobs, State, When } from "./parts.jsx";

export default async function Overview() {
  const index = await overview();

  return (
    <>
      <section>
        <h2>What the public sees</h2>
        <p className="why">
          The reader serves the newest publication marked public. A build that
          nobody has marked is a draft, readable only by its link.
        </p>
        {index.live ? (
          <table>
            <tbody>
              <tr>
                <td>Published</td>
                <td><When at={index.live.published_at} /> by {index.live.published_by}</td>
              </tr>
              <tr>
                <td>Panel</td>
                <td className="mono">{index.live.panel.join(", ")} · rubric {index.live.rubric}</td>
              </tr>
              <tr>
                <td>Cells</td>
                <td className="num">{index.live.cells}</td>
              </tr>
              <tr>
                <td>Digests</td>
                <td className="mono">
                  {index.live.payload_sha256.slice(0, 12)} ·{" "}
                  {index.live.documents_sha256.slice(0, 12)}
                </td>
              </tr>
              {index.live.grandfathered && (
                <tr>
                  <td>Exemption</td>
                  <td>
                    Grandfathered: its panels are unequal across labs on four
                    behaviours. No second exemption can exist.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        ) : (
          <p className="empty">Nothing is published. The reader has nothing to serve.</p>
        )}
        {index.drafts.length > 0 && (
          <p className="why" style={{ marginTop: 12 }}>
            {index.drafts.length} draft{index.drafts.length === 1 ? "" : "s"} waiting
            on a decision. <a href="/admin/publications">Publications</a>.
          </p>
        )}
      </section>

      {index.unread > 0 && (
        <section>
          <h2>Waiting to be read</h2>
          <p className="why">
            {index.unread} proposal{index.unread === 1 ? "" : "s"} arrived through the
            public form and nobody has acted on {index.unread === 1 ? "it" : "them"}.{" "}
            <a href="/admin/submissions">Read {index.unread === 1 ? "it" : "them"}</a>.
          </p>
        </section>
      )}

      <section>
        <h2>The registry</h2>
        <table>
          <tbody>
            <tr>
              <td><a href="/admin/behaviours">Behaviours</a></td>
              <td className="num">{index.behaviours.total}</td>
              <td>
                {index.behaviours.defined} written for a panel,{" "}
                {index.behaviours.judged} judged
              </td>
            </tr>
            <tr>
              <td><a href="/admin/specifications">Documents</a></td>
              <td className="num">{index.documents}</td>
              <td>{index.versions} versions, insert-only</td>
            </tr>
          </tbody>
        </table>
      </section>

      <section>
        <h2>Runs</h2>
        {index.runs.length === 0
          ? <p className="empty">No run has been composed.</p>
          : (
            <table>
              <thead>
                <tr>
                  <th>Composed</th><th>Panel</th>
                  <th className="num">Calls</th><th>State</th><th className="num">Cost</th>
                </tr>
              </thead>
              <tbody>
                {index.runs.map(run => (
                  <tr key={run.id}>
                    <td><a href={`/admin/runs#${run.id}`}><When at={run.created_at} /></a></td>
                    <td className="mono">{(run.panel || []).join(", ")}</td>
                    <td className="num">
                      {run.by_status.done || 0}/{run.calls}
                    </td>
                    <td><State value={run.status} /></td>
                    <td className="num"><Cost run={run} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
      </section>

      <section>
        <h2>Jobs</h2>
        <p className="why">
          Every launch of the judging container, and where it ran. A job started
          on a laptop and a job started by the deployment write into the same
          database.
        </p>
        <Jobs rows={index.jobs} />
      </section>
    </>
  );
}
