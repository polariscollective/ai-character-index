/* Composing a run, reading its price, launching it, watching it. */
import { behaviours, jobs, panels, runs, specifications } from "../../lib/admin-data.mjs";
import { launchRefusal } from "../../lib/runs.mjs";
import { Choices, Cost, Jobs, Outcome, State, When } from "../parts.jsx";

/* What pressing launch does, named for the state the run is in. It is one act
   underneath: the job takes every call of the run that is not done. */
const LAUNCH = { pending: "launch", cancelled: "resume", done: "retry failed calls" };

export default async function Runs({ searchParams }) {
  const params = await searchParams;
  const [rows, behaviourRows, specs, panelRows, jobRows] = await Promise.all([
    runs(25), behaviours(), specifications(), panels(), jobs(10),
  ]);

  return (
    <>
      <section>
        <h2>Runs</h2>
        <p className="why">
          A run is a batch of judge calls, one per behaviour × document × model.
          Every call exists before the work starts, so progress is a count rather
          than an estimate, and resuming is a filter over the calls that are not
          done. Composing spends nothing; launching spends. A run that came back
          with failed calls is retried in place, so its cells keep all their judges
          in one run.
        </p>
        <Outcome done={params?.done} problem={params?.problem} />
        {rows.length === 0 ? <p className="empty">No run has been composed.</p> : (
          <table>
            <thead>
              <tr>
                <th>Composed</th><th>Panel</th><th>Rubric</th>
                <th className="num">Done</th><th>State</th>
                <th className="num">Cost</th><th>Do</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(run => {
                const done = run.by_status.done || 0;
                const failed = (run.by_status.error || 0);
                return (
                  <tr key={run.id} id={run.id}>
                    <td>
                      <When at={run.created_at} />
                      <br />
                      <span className="mono" style={{ color: "var(--faint)" }}>
                        {run.id.slice(0, 8)} · {run.created_by}
                      </span>
                    </td>
                    <td className="mono">{(run.panel || []).join(", ")}</td>
                    <td className="mono">{run.rubric}</td>
                    <td className="num">
                      {done}/{run.calls}
                      {failed > 0 && (
                        <>
                          <br />
                          <span style={{ color: "var(--fail)" }}>{failed} failed</span>
                        </>
                      )}
                    </td>
                    <td>
                      <State value={run.status} />
                      {run.error && (
                        <>
                          <br />
                          <span style={{ color: "var(--fail)" }}>{run.error}</span>
                        </>
                      )}
                    </td>
                    <td className="num"><Cost run={run} /></td>
                    <td>
                      {launchRefusal(run, run.by_status) === null && (
                        <form method="post" action="/api/admin/runs"
                              style={{ display: "inline" }}>
                          <input type="hidden" name="verb" value="launch" />
                          <input type="hidden" name="run_id" value={run.id} />
                          <button className="quiet" type="submit">
                            {LAUNCH[run.status] || "resume"}
                          </button>
                        </form>
                      )}
                      {run.status === "running" && (
                        <form method="post" action="/api/admin/runs"
                              style={{ display: "inline" }}>
                          <input type="hidden" name="verb" value="cancel" />
                          <input type="hidden" name="run_id" value={run.id} />
                          <button className="quiet" type="submit">cancel</button>
                        </form>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>

      <section>
        <h2>Compose a run</h2>
        <p className="why">
          This writes the calls and prices them, and spends nothing. Judges score on
          the v5 rubric, the only one the judging job composes.
        </p>
        <form className="panel" method="post" action="/api/admin/runs">
          <input type="hidden" name="verb" value="compose" />
          <input type="hidden" name="rubric" value="v5" />
          <Choices
            name="behaviours"
            legend="Behaviours"
            hint="A behaviour marked (no brief) is not refused: it is judged against a
                  blank scope, so its verdicts answer a question nobody wrote."
            options={behaviourRows.map(row => ({
              value: row.slug,
              label: `${row.name}${row.defined ? "" : " (no brief)"}`,
            }))}
          />
          <Choices
            name="specs"
            legend="Documents"
            hint="The newest version of each, which is what the composer reads."
            options={specs.map(spec => ({
              value: spec.id,
              label: `${spec.short_title} (${spec.versions[0]?.version ?? "no version"})`,
            }))}
          />
          <label>
            <span>Panel</span>
            <select name="panel" defaultValue="frontier_fast">
              {panelRows.map(panel => (
                <option key={panel.name} value={panel.name}>
                  {panel.name}: {panel.seats.join(", ")}
                </option>
              ))}
            </select>
            <span className="hint">
              One call per seat per cell. A panel of three over ten behaviours and
              two documents is sixty calls.
            </span>
          </label>
          <fieldset>
            <legend>Cells already judged</legend>
            <p className="why" style={{ margin: "0 0 8px" }}>
              Left unticked, a judge that has already scored a behaviour on this
              version of a document is left out, and nothing is paid for twice. A cell
              whose judges end up split across two runs cannot be published, because a
              publication needs all of a cell&apos;s judges in one run.
            </p>
            <label className="check">
              <input type="checkbox" name="again" />
              <span>Judge them again with the whole panel, and pay for it</span>
            </label>
          </fieldset>
          <label>
            <span>Credit these verdicts to</span>
            <input type="text" name="credit" placeholder="Ada Lovelace; Charles Babbage" />
            <span className="hint">
              A publication computes its own citation from this, so write it as it
              should read in an author field. Left empty, the run is credited to the
              address you signed in with, which is not a citation.
            </span>
          </label>
          <button type="submit">Compose and price</button>
        </form>
      </section>

      <section>
        <h2>Jobs</h2>
        <Jobs rows={jobRows} />
      </section>
    </>
  );
}
