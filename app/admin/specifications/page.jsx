/* The documents, their versions, and the form that adds one. */
import { specifications } from "../../lib/admin-data.mjs";
import { Outcome, When } from "../parts.jsx";

export default async function Specifications({ searchParams }) {
  const params = await searchParams;
  const specs = await specifications();

  return (
    <>
      <section>
        <h2>Documents</h2>
        <p className="why">
          Versions are insert-only, enforced by privilege rather than by
          convention: nothing can move text a stored locator points at. A
          correction is a new version, and the two coexist, which is the truth
          about a lab that reissues a document under the same label.
        </p>
        <Outcome done={params?.done} problem={params?.problem} />
        {specs.map(spec => (
          <div key={spec.id} style={{ marginBottom: 22 }}>
            <h3><span className="mono">{spec.id}</span> · {spec.title}</h3>
            <p className="why" style={{ margin: "0 0 8px" }}>
              {spec.lab_name} · locators by{" "}
              {spec.locator_style === "anchor" ? "heading anchor" : "heading path"} ·{" "}
              <a href={spec.source_url}>source</a>
            </p>
            <table>
              <thead>
                <tr><th>Version</th><th>Digest</th><th>Registered</th><th>By</th></tr>
              </thead>
              <tbody>
                {spec.versions.map(version => (
                  <tr key={version.id}>
                    <td className="mono">{version.version}</td>
                    <td className="mono">{version.content_sha256.slice(0, 12)}</td>
                    <td><When at={version.added_at} /></td>
                    <td>{version.added_by}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </section>

      <section>
        <h2>Register a version</h2>
        <p className="why">
          Give an id the index already carries to add a version to it, or a new one
          to add a document. The id and the label go into every locator this text is
          cited by, so neither may contain an @ or a path separator.
        </p>
        <form className="panel" method="post" action="/api/admin/specifications">
          <label>
            <span>Document id</span>
            <input type="text" name="id" required placeholder="model-spec"
                   list="known-specs" />
            <datalist id="known-specs">
              {specs.map(spec => <option key={spec.id} value={spec.id} />)}
            </datalist>
          </label>
          <label>
            <span>Version label</span>
            <input type="text" name="version" required placeholder="2026-01-20" />
            <span className="hint">
              Whatever the lab calls this release. No date format is imposed.
            </span>
          </label>
          <label>
            <span>Source url</span>
            <input type="url" name="source_url" required
                   placeholder="https://example.com/spec" />
          </label>
          <label>
            <span>Markdown</span>
            <textarea name="markdown" required style={{ minHeight: 200 }} />
            <span className="hint">
              The document itself. Its digest identifies the version, so the same
              bytes cannot be registered twice under two labels.
            </span>
          </label>

          <fieldset>
            <legend>Only for a document the index has not seen</legend>
            <label>
              <span>Lab</span>
              <input type="text" name="lab" placeholder="openai" />
            </label>
            <label>
              <span>Title</span>
              <input type="text" name="title" placeholder="OpenAI Model Spec" />
            </label>
            <label>
              <span>Short title</span>
              <input type="text" name="short_title" placeholder="Model Spec" />
            </label>
            <label>
              <span>How a locator names a section</span>
              <select name="locator_style" defaultValue="path">
                <option value="path">the path of heading titles</option>
                <option value="anchor">a stable heading anchor</option>
              </select>
              <span className="hint">
                The one thing the judging engine cannot guess about a new document.
              </span>
            </label>
          </fieldset>

          <button type="submit">Register</button>
        </form>
      </section>
    </>
  );
}
