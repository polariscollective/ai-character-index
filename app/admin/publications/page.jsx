/* What the reader shows, and the decision to show it. */
import { behaviours, panels, publications, specifications } from "../../lib/admin-data.mjs";
import { Choices, Outcome, When } from "../parts.jsx";

export default async function Publications({ searchParams }) {
  const params = await searchParams;
  const [rows, behaviourRows, specs, panelRows] = await Promise.all([
    publications(), behaviours(), specifications(), panels(),
  ]);
  const seats = [...new Set(panelRows.flatMap(panel => panel.seats))].sort();

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
                  </td>
                  <td className="mono">
                    {(row.panel || []).join(", ")}
                    <br />rubric {row.rubric}
                    {row.grandfathered && <><br />grandfathered</>}
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
                  </td>
                  <td>
                    <a href={`/spec-reader/?publication=${row.id}`}>read</a>
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
          Every cell must have been judged by exactly the models named below, all of
          them done, in one run. That is the claim the index sells: a verdict on one
          lab&apos;s document and a verdict on another&apos;s were reached the same way.
          It is refused here and again by the database. The build is written as a
          draft, and making it public is the next decision.
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
            name="specs"
            legend="Documents"
            options={specs.map(spec => ({ value: spec.id, label: spec.short_title }))}
          />
          <Choices
            name="panel"
            legend="The panel every cell must carry"
            options={seats.map(seat => ({ value: seat, label: seat }))}
            hint="Not a panel name: the exact set of models. A cell judged by more
                  models than these is not an answer to this publication."
          />
          <label>
            <span>Rubric</span>
            <input type="text" name="rubric" defaultValue="v5" />
          </label>
          <label>
            <span>Note</span>
            <input type="text" name="notes"
                   placeholder="What changed, for whoever reads this row later." />
          </label>
          <button type="submit">Build as a draft</button>
        </form>
      </section>
    </>
  );
}
