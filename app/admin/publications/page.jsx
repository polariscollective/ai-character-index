/* What the reader shows, and the decision to show it. */
import { behaviours, displayPanel, linkRuns, publications, specifications } from "../../lib/admin-data.mjs";
import { documentChoices } from "../../lib/documents.mjs";
import { Choices, Outcome, When } from "../parts.jsx";

export default async function Publications({ searchParams }) {
  const params = await searchParams;
  const [rows, behaviourRows, specs, linkRunRows] = await Promise.all([
    publications(), behaviours(), specifications(), linkRuns(),
  ]);
  const panel = displayPanel();

  return (
    <>
      <section>
        <h2>Publications</h2>
        <p className="why">
          A publication selects, cell by cell, which run answers, and carries the two
          payloads the reader&apos;s routes serve. It is insert-only: the one thing
          that moves is whether the public sees it. Publishing is therefore a
          database write rather than a deploy.
        </p>
        <Outcome done={params?.done} problem={params?.problem} />
        {rows.length === 0 ? <p className="empty">Nothing has been built.</p> : (
          <table>
            <thead>
              <tr>
                <th>Built</th><th>Panel</th><th className="num">Cells</th>
                <th>Shown</th><th>Digests</th><th>Do</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(row => (
                <tr key={row.id}>
                  <td>
                    <When at={row.published_at} />
                    <br />
                    <span className="mono" style={{ color: "var(--faint)" }}>
                      {row.published_by}
                    </span>
                    {row.notes && <><br />{row.notes}</>}
                    {/* The description is the one thing on a publication that can
                        be changed after it is built: no digest covers it. */}
                    <details>
                      <summary>edit the description</summary>
                      <form method="post" action="/api/admin/publications">
                        <input type="hidden" name="verb" value="describe" />
                        <input type="hidden" name="publication_id" value={row.id} />
                        <textarea name="notes" rows={3} defaultValue={row.notes || ""} />
                        <button className="quiet" type="submit">Save the description</button>
                      </form>
                    </details>
                  </td>
                  <td className="mono">
                    {(row.panel || []).join(", ")}
                    <br />rubric {row.rubric}
                  </td>
                  <td className="num">{row.cells}</td>
                  <td>
                    <span className={`flag ${row.is_public ? "public" : "draft"}`}>
                      {row.is_public ? "public" : "draft"}
                    </span>
                  </td>
                  <td className="mono">
                    {row.payload_sha256.slice(0, 10)}
                    <br />{row.documents_sha256.slice(0, 10)}
                    <br />{row.links_sha256 ? row.links_sha256.slice(0, 10) : "no links"}
                  </td>
                  <td>
                    <a href={`/doc-reader/?publication=${row.id}`}>read</a>
                    <br />
                    <form method="post" action="/api/admin/publications">
                      <input type="hidden" name="verb"
                             value={row.is_public ? "withdraw" : "publish"} />
                      <input type="hidden" name="publication_id" value={row.id} />
                      <button className="quiet" type="submit">
                        {row.is_public ? "withdraw" : "make public"}
                      </button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section>
        <h2>Build a publication</h2>
        <p className="why">
          Every cell must have been judged by {panel.seats.join(", ")} ({panel.name}),
          all of them done, in one run, with a depth from each. That is the claim the
          index sells: a verdict on one document and a verdict on another were reached
          the same way. It is refused here and again by the database. The build is
          written as a draft, and making it public is the next decision.
        </p>
        <form className="panel" method="post" action="/api/admin/publications">
          <input type="hidden" name="verb" value="build" />
          <Choices
            name="behaviours"
            legend="Behaviours"
            options={behaviourRows.filter(row => row.judged)
              .map(row => ({ value: row.slug, label: row.name }))}
            hint="Only behaviours a panel has answered for can be published."
          />
          <Choices
            name="documents"
            legend="Documents"
            options={documentChoices(specs)}
            hint="Each version is its own document."
          />
          <Choices
            name="link_runs"
            legend="Link runs"
            options={linkRunRows.filter(row => row.status === "done")
              .map(row => ({ value: row.id,
                             label: `${row.id.slice(0, 8)} ${row.created_at.slice(0, 10)} ${row.created_by}` }))}
            hint="The publication carries the bubbles, comparisons and notes of the runs you choose here."
          />
          <input type="hidden" name="rubric" value="v5" />
          <label>
            <span>Note</span>
            <input type="text" name="notes"
                   placeholder="What changed, for whoever reads this row later." />
          </label>
          <label>
            <span>Credit this build to</span>
            <input type="text" name="credit" defaultValue="Polaris Collective" />
            <span className="hint">
              How the build reads in the row above and in a citation. Left empty,
              it credits the Collective; it is never the address you signed in
              with.
            </span>
          </label>
          <button type="submit">Build as a draft</button>
        </form>
      </section>
    </>
  );
}
