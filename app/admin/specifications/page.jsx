/* The documents, their versions, and the form that adds one. */
import { labs, specifications } from "../../lib/admin-data.mjs";
import { Outcome, When } from "../parts.jsx";

export default async function Specifications({ searchParams }) {
  const params = await searchParams;
  const [specs, labRows] = await Promise.all([specifications(), labs()]);

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
          A document is named by its lab and its name, and each version is a document
          of its own. Registering a name the index already carries adds a version to it.
        </p>
        <form className="panel" method="post" action="/api/admin/specifications">
          <label>
            <span>Lab</span>
            <select name="lab" defaultValue="" required>
              <option value="">Choose the lab that publishes it</option>
              {labRows.map(lab => <option key={lab.id} value={lab.id}>{lab.name}</option>)}
            </select>
            <span className="hint">
              A lab missing from this list is added by a migration in
              polaris-supabase, not here.
            </span>
          </label>
          <label>
            <span>Document name</span>
            <input type="text" name="name" required placeholder="model-spec" list="known-names" />
            <datalist id="known-names">
              {[...new Set(specs.map(spec => spec.id.split("--")[1]).filter(Boolean))]
                .map(name => <option key={name} value={name} />)}
            </datalist>
            <span className="hint">
              Lowercase words joined by hyphens. With the lab it names the document,
              openai--model-spec; the name of a document the index carries adds a version to it.
            </span>
          </label>
          <label>
            <span>Version</span>
            <input type="text" name="version" required placeholder="2026-08-18" />
            <span className="hint">The release date, year first: a citation reads it as a date.</span>
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
          <label>
            <span>Credit this version to</span>
            <input type="text" name="credit" defaultValue="Polaris Collective" />
            <span className="hint">
              How the registrar reads in a publication&apos;s citation. Left empty,
              it credits the Collective; it is never the address you signed in
              with.
            </span>
          </label>

          <fieldset>
            <legend>Only for a document the index has not seen</legend>
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
