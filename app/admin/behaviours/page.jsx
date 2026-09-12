/* The registry, and the form that adds to it. */
import { behaviours } from "../../lib/admin-data.mjs";
import { Outcome } from "../parts.jsx";

export default async function Behaviours({ searchParams }) {
  const params = await searchParams;
  const rows = await behaviours();
  const sets = [...new Set(rows.map(row => row.set_name))];

  return (
    <>
      <section>
        <h2>Behaviours</h2>
        <p className="why">
          The slug is the identity, across every run and every publication. Written
          for a panel and judged are independent states: a behaviour carries a brief
          once someone has written what its construct is, and is judged once a call
          for it has finished. One row here is judged without a brief, which is a
          fact about the bench the index inherited.
        </p>
        <Outcome done={params?.done} problem={params?.problem} />
        <table>
          <thead>
            <tr>
              <th>Slug</th><th>Name</th><th>Set</th><th className="num">#</th>
              <th>Brief</th><th>Judged</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(row => (
              <tr key={row.slug}>
                <td className="mono">{row.slug}</td>
                <td>{row.name}</td>
                <td className="mono">{row.set_name}</td>
                <td className="num">{row.numeric_id}</td>
                <td>{row.defined ? "written" : <span className="empty">none</span>}</td>
                <td>{row.judged ? "yes" : <span className="empty">no</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section>
        <h2>Register a behaviour</h2>
        <p className="why">
          The judging half is required. A behaviour with no brief reaches a panel
          with its scope blank, and the panel answers a question nobody wrote.
        </p>
        <form className="panel" method="post" action="/api/admin/behaviours">
          <label>
            <span>Slug</span>
            <input type="text" name="slug" required placeholder="user-autonomy" />
            <span className="hint">Lowercase words joined by hyphens. Never reused.</span>
          </label>
          <label>
            <span>Name</span>
            <input type="text" name="name" required placeholder="User autonomy" />
          </label>
          <label>
            <span>Set</span>
            <select name="set" defaultValue="reader-test">
              {sets.map(set => <option key={set} value={set}>{set}</option>)}
            </select>
            <span className="hint">
              The numeric id is assigned within the set, which is why it is not asked for.
            </span>
          </label>
          <label>
            <span>Group</span>
            <input type="text" name="group" required placeholder="Behaviours under test" />
            <span className="hint">The heading it appears under in the reader&apos;s menu.</span>
          </label>
          <label>
            <span>What the judges are asked</span>
            <textarea name="query" required
                      placeholder="The model should respect users' right to make decisions within their own lives..." />
            <span className="hint">
              The brief the panel is given, word for word. This is what a judgement
              is a judgement of.
            </span>
          </label>
          <label>
            <span>Where the construct stops</span>
            <textarea name="boundary" required
                      placeholder="The construct is X. NOT this behaviour: Y." />
            <span className="hint">
              The frontier. Say what the behaviour is not, or the panel draws its
              own line and every judge draws a different one.
            </span>
          </label>
          <label>
            <span>Where the definition comes from</span>
            <input type="text" name="source" required
                   placeholder="behaviours-for-adria (definition as supplied)" />
          </label>
          <label>
            <span>How the index describes it</span>
            <textarea name="definition"
                      placeholder="Leave empty to use the brief above." />
            <span className="hint">
              Optional, and only worth filling in where the reader should be told
              something other than the brief.
            </span>
          </label>
          <button type="submit">Register</button>
        </form>
      </section>
    </>
  );
}
