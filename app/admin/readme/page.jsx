/* The portal, explained to someone who has never used it.
 *
 * Prose, and static on purpose, with one exception: the panels are read from the
 * configuration the Runs form reads, so this page cannot recommend a panel the
 * form does not offer. Everything else that can go stale says when it was true,
 * and was checked against the database and the code on that date. */
import { panels } from "../../lib/admin-data.mjs";

const CONTENTS = [
  ["words", "The words the portal uses"],
  ["tabs", "What each tab is for"],
  ["new-version", "Add a new version of a specification"],
  ["judges", "Choose the judges"],
  ["cost", "What it costs"],
  ["publish", "Make it public"],
  ["new-behaviour", "Add a behaviour"],
  ["judge-again", "Judge a behaviour again"],
  ["remove", "Take something off the public site"],
  ["proposals", "Proposals from the public"],
  ["limits", "What the portal cannot do yet"],
];
const TITLE = Object.fromEntries(CONTENTS);

const PANEL_USE = {
  frontier_fast: "The panel the public index is judged with. Use it for anything you mean to publish.",
  cheap: "Three inexpensive models. The portal does not offer it.",
  itest: "One cheap model, for checking the pipeline from the command line. The portal does not offer it.",
  frontier: "Kept for older runs. Not needed for new work.",
  frontier_primary: "Kept for older runs. Not needed for new work.",
};

/* What the composer priced one behaviour at, per panel and specification, on the
 * date in the caption. Recomputed with compose_run.plan, which writes nothing. */
const ESTIMATES = [
  ["frontier_fast", "0.79", "1.17"],
  ["cheap", "0.08", "0.12"],
  ["itest", "0.01", "0.01"],
];

function Section({ id, children }) {
  return (
    <section id={id}>
      <h2>{TITLE[id]}</h2>
      {children}
    </section>
  );
}

export default function Readme() {
  const panelRows = panels();

  return (
    <div className="guide">
      <section>
        <h2>Readme</h2>
        <p className="why">
          How to use this portal, for someone who has never used it. Every step names
          the tab and the button.
        </p>
        <ol className="contents">
          {CONTENTS.map(([id, title]) => (
            <li key={id}><a href={`#${id}`}>{title}</a></li>
          ))}
        </ol>
      </section>

      <Section id="words">
        <p>
          The index reads the rulebooks AI labs publish for their models, and shows,
          passage by passage, where each one addresses a given behaviour. The whole
          job is five steps:
        </p>
        <ol>
          <li><strong>Register</strong> the text of a specification (Specifications).</li>
          <li>
            <strong>Compose a run</strong>: choose the behaviours and the documents,
            and read the price. Nothing is spent (Runs).
          </li>
          <li>
            <strong>Launch the run</strong>. The judges read the text, score it and
            give each behaviour a depth. This spends money (Runs).
          </li>
          <li>
            <strong>Build a publication</strong> from the results. It is a draft
            nobody else sees (Publications).
          </li>
          <li><strong>Read the draft</strong>, then make it public (Publications).</li>
        </ol>
        <table>
          <thead><tr><th>Word</th><th>What it means</th></tr></thead>
          <tbody>
            <tr>
              <td>Specification</td>
              <td>
                The rulebook a lab publishes for its models, such as the OpenAI Model
                Spec or Claude&apos;s constitution. Each version registered for it is a
                document. Its text is stored as markdown, one row per version, and a
                stored version is never edited.
              </td>
            </tr>
            <tr>
              <td>Lab</td>
              <td>
                The organisation that publishes a specification, such as Anthropic or
                OpenAI. It has nothing to do with which models judge it.
              </td>
            </tr>
            <tr>
              <td>Behaviour</td>
              <td>
                A trait the index looks for, such as user autonomy. Each carries a
                brief: what the judges are asked, and where the trait stops.
              </td>
            </tr>
            <tr>
              <td>Judge</td>
              <td>
                An AI model that reads a whole document and scores every passage
                from 0 to 3 for one behaviour.
              </td>
            </tr>
            <tr>
              <td>Panel</td>
              <td>
                A named group of judges. The public index uses{" "}
                <code>frontier_fast</code>: <code>sol</code>, <code>fable</code> and{" "}
                <code>deepseek</code>.
              </td>
            </tr>
            <tr>
              <td>Cell</td>
              <td>One behaviour on one document. The public reader is made of cells.</td>
            </tr>
            <tr>
              <td>Depth</td>
              <td>
                How deeply a document covers a behaviour, from 0 (absent) to 4 (rules
                with worked examples). Each judge gives one after reading the passages
                the panel found, and the reader shows their mean beside the behaviour.
              </td>
            </tr>
            <tr>
              <td>Run</td>
              <td>
                A batch of judge calls: every behaviour you chose, on every
                document you chose, by every judge on the panel. Composing a run
                prices it; launching it spends the money.
              </td>
            </tr>
            <tr>
              <td>Publication</td>
              <td>
                A frozen set of results the public reader shows. It is built as a
                draft, and becomes public when you say so.
              </td>
            </tr>
            <tr>
              <td>Job</td>
              <td>
                The worker that does the slow part in the background: pricing a run,
                judging it, building a publication. The Jobs tables say whether it
                finished and, if not, why.
              </td>
            </tr>
          </tbody>
        </table>
      </Section>

      <Section id="tabs">
        <table>
          <tbody>
            <tr>
              <td><a href="/admin">Overview</a></td>
              <td>
                What the public sees now, and the latest runs and jobs. Look here to
                check whether something finished.
              </td>
            </tr>
            <tr>
              <td><a href="/admin/behaviours">Behaviours</a></td>
              <td>Every behaviour, and the form that adds one.</td>
            </tr>
            <tr>
              <td><a href="/admin/specifications">Specifications</a></td>
              <td>Every specification and its versions, and the form that adds a version.</td>
            </tr>
            <tr>
              <td><a href="/admin/runs">Runs</a></td>
              <td>Choose what to judge, read the price, launch.</td>
            </tr>
            <tr>
              <td><a href="/admin/publications">Publications</a></td>
              <td>Build what the public sees, read it first, make it public.</td>
            </tr>
            <tr>
              <td><a href="/admin/submissions">Proposals</a></td>
              <td>Suggestions sent by visitors through the site&apos;s form.</td>
            </tr>
            <tr>
              <td><a href="/spec-reader/">Reader</a></td>
              <td>The public reader itself.</td>
            </tr>
          </tbody>
        </table>
        <p>
          Pages do not refresh on their own. After pressing a button, reload the page
          to see what happened.
        </p>
      </Section>

      <Section id="new-version">
        <p className="why">
          For example, a newer OpenAI Model Spec. As of September 2026 the index
          carries the version dated <code>2025-12-18</code>, and OpenAI has published
          one dated <code>2026-08-18</code>.
        </p>
        <ol>
          <li>
            <strong>Fetch the markdown yourself.</strong> The portal does not download
            a link or read a web page: it takes the text you paste. Take the markdown
            source the lab publishes, not a copy of its web page.
            <ul>
              <li>
                OpenAI Model Spec: the file <code>model_spec.md</code> in{" "}
                <a href="https://github.com/openai/model_spec">github.com/openai/model_spec</a>.
                Open it on GitHub, press Raw, copy everything. Check that{" "}
                <code>latest_version</code> in <code>docs/version-manifest.json</code>{" "}
                is the version you mean to register.
              </li>
              <li>
                Claude&apos;s constitution:{" "}
                <a href="https://github.com/anthropics/claude-constitution">github.com/anthropics/claude-constitution</a>,
                one file per version, named after its date, such as{" "}
                <code>20260120-constitution.md</code>.
              </li>
            </ul>
            Why the source and not the page: the Model Spec&apos;s headings carry
            anchors such as <code>{"{#overview}"}</code>, and every citation points at
            one. A web page converted to markdown loses them.
          </li>
          <li>
            <strong>Specifications, Register a version.</strong>
            <ul>
              <li>Lab: the lab that publishes it.</li>
              <li>
                Document name: <code>model-spec</code> or <code>constitution</code> for a
                document the index carries, which adds a version to it.
              </li>
              <li>Version: the release date, written <code>2026-08-18</code>.</li>
              <li>
                Source url: where a reader should be sent, for example{" "}
                <code>https://model-spec.openai.com/2026-08-18.html</code>.
              </li>
              <li>Markdown: the whole file.</li>
            </ul>
            Press <strong>Register</strong>. The public site does not change: a
            registered text is neither judged nor shown until you say so.
          </li>
          <li>
            <strong>Runs, Compose a run.</strong> Tick the behaviours and the documents.
            Each version is its own document: ticking both Model Spec versions judges both.
            Press <strong>Compose and price</strong>. Nothing is spent.
          </li>
          <li>
            <strong>Reload after a few seconds.</strong> The run appears at the top of
            the table as <code>pending</code>, with its number of calls and its
            estimated cost. If it does not appear, the Jobs table below it says why.
          </li>
          <li>
            <strong>Press launch.</strong> The judges start. Each call reads the whole
            document and takes from under a minute to several minutes, and
            several run at once. Reload to follow the Done column.
          </li>
          <li>
            <strong>If some calls or depths failed, press retry calls and depths.</strong>{" "}
            Only the calls and depths that are not done are tried again, in the same
            run, and they are paid for again. The same run matters: a publication
            needs all of a cell&apos;s judges and their depths in one run.
          </li>
          <li>
            <strong>Publish it</strong>, as described in{" "}
            <a href="#publish">Make it public</a>.
          </li>
        </ol>
        <div className="notice">
          <p>
            Write the version as a date, year first. The index lists a document&apos;s
            versions newest first by sorting them as text: <code>2026-08-18</code> comes
            after <code>2025-12-18</code>, but a version such as <code>v3</code> would
            come after every date.
          </p>
        </div>
      </Section>

      <Section id="judges">
        <p className="why">You choose a panel, not individual models.</p>
        <table>
          <thead><tr><th>Panel</th><th>Judges</th><th>When to use it</th></tr></thead>
          <tbody>
            {panelRows.map(panel => (
              <tr key={panel.name}>
                <td className="mono">{panel.name}</td>
                <td className="mono">{panel.seats.join(", ")}</td>
                <td>{PANEL_USE[panel.name] || ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p>
          The portal always uses <code>frontier_fast</code>: <code>sol</code>,{" "}
          <code>fable</code> and <code>deepseek</code>. The other panels in the table stay
          in the configuration for the command line.
        </p>
        <p>
          A combination no panel offers has to be added to{" "}
          <code>engine/panel/panel-config.json</code> in the repository and merged into{" "}
          <code>main</code>. The site and the judging job both redeploy from that
          merge, and the portal composes and publishes with it once{" "}
          <code>display.panel</code> names it. It is a code change, not a button.
        </p>
      </Section>

      <Section id="cost">
        <p className="why">The price is shown before anything is spent.</p>
        <p>
          Composing a run writes its estimated cost in the Cost column, with a ~ in
          front. Launching is a separate press. Once the run is done, the column shows
          what was actually spent.
        </p>
        <table>
          <thead>
            <tr>
              <th>Panel</th>
              <th className="num">Constitution</th>
              <th className="num">Model Spec</th>
            </tr>
          </thead>
          <tbody>
            {ESTIMATES.map(([panel, constitution, modelSpec]) => (
              <tr key={panel}>
                <td className="mono">{panel}</td>
                <td className="num">${constitution}</td>
                <td className="num">${modelSpec}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="caption mono">
          Estimated cost of one behaviour, as of 14 September 2026, against
          constitution 2026-01-20 and Model Spec 2025-12-18.
        </p>
        <p>
          So ten behaviours on the Model Spec with <code>frontier_fast</code> come to
          about $12. The estimate counts the length of the specification and a short
          answer per passage. It does not count the reasoning some judges do before
          answering, so the real bill for <code>sol</code> and <code>fable</code> can
          be higher. It is good for telling a two-dollar run from a two-hundred-dollar
          one.
        </p>
      </Section>

      <Section id="publish">
        <p className="why">
          A publication is a frozen snapshot. It is built as a draft, and nobody sees
          it until you make it public.
        </p>
        <ol>
          <li>
            <strong>Publications, Build a publication.</strong> Tick the behaviours.
            Tick the documents: both, if the reader should compare the two labs.
            Keep the note saying what changed. Press{" "}
            <strong>Build as a draft</strong>.
          </li>
          <li>
            <strong>Reload after a few seconds.</strong> The draft appears in the
            table. If it does not, the Jobs table on <a href="/admin">Overview</a>{" "}
            says why, and names the cells no run answered.
          </li>
          <li>
            <strong>Press read.</strong> The draft opens in the reader. Only someone
            holding that link can see it.
          </li>
          <li>
            <strong>Press make public.</strong> The public reader shows it straight
            away. There is no deploy.
          </li>
          <li>
            <strong>To undo, press withdraw.</strong> The reader goes back to the
            newest publication still public.
          </li>
        </ol>
        <div className="notice">
          <p>
            The rule a build checks: every behaviour on every document you ticked must
            have been judged by the index&apos;s three judges, all of them done, in the
            same run, with a depth from each. The database refuses a build that breaks it.
          </p>
        </div>
      </Section>

      <Section id="new-behaviour">
        <p className="why">
          A behaviour is only a row until a run judges it and a publication shows it.
        </p>
        <ol>
          <li>
            <strong>Behaviours, Register a behaviour.</strong>
            <ul>
              <li>Slug: lowercase words joined by hyphens, such as <code>user-autonomy</code>. Never reused.</li>
              <li>Name: as the reader should show it.</li>
              <li>Credit this behaviour to: <code>Polaris Collective</code>, already filled in.</li>
              <li>Group: the heading it sits under in the reader&apos;s menu.</li>
              <li>
                What the judges are asked: the brief, word for word. Every verdict is a
                verdict on this text.
              </li>
              <li>
                Where the construct stops: what the behaviour is not. Without it, each
                judge draws its own line.
              </li>
              <li>Where the definition comes from: who wrote it.</li>
            </ul>
            Press <strong>Register</strong>.
          </li>
          <li>
            <strong>Runs, compose it on both documents with{" "}
            <code>frontier_fast</code>, and launch.</strong> Two documents times
            three judges is six calls, about $2.
          </li>
          <li>
            <strong>Publications, build a draft</strong> with the new behaviour and the
            behaviours already public, read it, and make it public.
          </li>
        </ol>
      </Section>

      <Section id="judge-again">
        <p className="why">
          Tick &ldquo;Judge them again with the whole panel&rdquo; when you compose.
        </p>
        <ul>
          <li>
            By default, a judge that has already scored a behaviour on a version of a
            specification is left out when you compose, so nothing is paid for twice.
            If every judge is left out, the job finishes and no run appears.
          </li>
          <li>
            To replace verdicts, tick <strong>Judge them again with the whole
            panel</strong> under Cells already judged. Every judge of the panel scores
            every cell again, in one new run, and you pay for all of it.
          </li>
          <li>
            The next publication you build takes the newest run for each cell, so the
            new verdicts replace the old ones there. Publications already built keep
            theirs.
          </li>
          <li>
            Leave the box unticked with a panel that shares some judges with an earlier
            run, and the run leaves those judges out. A cell whose judges are split
            across two runs cannot be published, so tick the box in that case.
          </li>
          <li>A new version of a specification is new text: every judge scores it without the box.</li>
        </ul>
      </Section>

      <Section id="remove">
        <p className="why">Nothing is deleted. You make a smaller publication public.</p>
        <ul>
          <li>
            To remove a behaviour or a specification from the public site, build a
            publication without it, read it, and make it public. The reader always shows
            the newest public publication, so the older one stops being shown. It stays
            readable by its link.
          </li>
          <li>
            To take back the publication you just made public, press{" "}
            <strong>withdraw</strong> on it. The reader returns to the newest one still
            public.
          </li>
          <li>
            Behaviours, specifications, runs and publications cannot be edited or
            deleted from the portal. A specification version in particular is never
            changed: a correction is a new version.
          </li>
        </ul>
      </Section>

      <Section id="proposals">
        <ul>
          <li>
            <a href="/admin/submissions">Proposals</a> lists what visitors sent through
            the site. Mark each one reviewing, accepted or declined.
          </li>
          <li>
            Accepting registers nothing. To take a proposal on, type it into Register a
            behaviour or Register a version yourself. That is deliberate: it is the
            moment a stranger&apos;s words become the index&apos;s.
          </li>
          <li>
            A proposed specification carries a link to the file its sender uploaded.
            The link works for an hour after the page loads.
          </li>
        </ul>
      </Section>

      <Section id="limits">
        <p className="why">As of September 2026.</p>
        <ul>
          <li>
            <strong>A specification from a new lab.</strong> The form offers the
            principal labs; one missing from its list is added by a migration in{" "}
            <code>polaris-supabase</code>.
          </li>
          <li>
            <strong>Behaviours without a brief.</strong> The Runs form marks them{" "}
            <code>(no brief)</code>. Do not tick them: a judge needs a brief to know
            what it is scoring.
          </li>
        </ul>
      </Section>
    </div>
  );
}
