/* The few pieces every page repeats. Presentational only: no page passes
   anything here that it did not read from the database itself. */

/** A status, spelled the way the database spells it. */
export function State({ value }) {
  return <span className={`state ${value}`}>{value}</span>;
}

/** A timestamp, to the minute. The reader's dates are days; an operator watching
 *  a run needs the time, and nobody needs the seconds. */
export function When({ at }) {
  if (!at) return <span className="empty">—</span>;
  const stamp = new Date(at);
  return (
    <time dateTime={at} className="mono">
      {stamp.toISOString().slice(0, 16).replace("T", " ")}
    </time>
  );
}

/** Whether what was asked for happened, as the page was reloaded with the answer.
 *
 *  The forms post to routes and the routes redirect back with ?done= or ?problem=,
 *  so the result survives the reload and the back button rather than living in a
 *  client-side state nobody can link to. */
export function Outcome({ done, problem }) {
  if (problem) {
    return (
      <div className="notice bad" role="alert">
        {problem.split("\n").map((line, i) => <p key={i}>{line}</p>)}
      </div>
    );
  }
  if (done) {
    return (
      <div className="notice" role="status">
        {done.split("\n").map((line, i) => <p key={i}>{line}</p>)}
      </div>
    );
  }
  return null;
}

/** What a run cost, or what it is expected to.
 *
 *  Null is not zero. The bench the index inherited carries no per-call cost -- its
 *  meter readings lived in a file that was never committed -- so a done run with no
 *  figure is unmetered rather than free, and saying $0 would be a claim. */
export function Cost({ run }) {
  if (run.cost_usd !== null && run.cost_usd !== undefined) {
    return <span>${run.cost_usd}</span>;
  }
  if (run.status === "done") return <span className="empty">not metered</span>;
  if (run.estimated_usd === null || run.estimated_usd === undefined) {
    return <span className="empty">unpriced</span>;
  }
  return <span title="priced, not yet spent">~${run.estimated_usd}</span>;
}

export function Jobs({ rows }) {
  if (!rows || rows.length === 0) {
    return <p className="empty">No job has been launched.</p>;
  }
  return (
    <table>
      <thead>
        <tr>
          <th>Launched</th><th>Mode</th><th>Where</th><th>State</th><th>Outcome</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(job => (
          <tr key={job.id}>
            <td><When at={job.created_at} /></td>
            <td className="mono">{job.mode}</td>
            <td className="mono">{job.origin}</td>
            <td><State value={job.status} /></td>
            <td>
              {job.error
                ? <span style={{ color: "var(--fail)" }}>{job.error}</span>
                : job.run_id
                  ? <a href={`/admin/runs#${job.run_id}`}>run</a>
                  : job.publication_id
                    ? <a href="/admin/publications">publication</a>
                    : <span className="empty">—</span>}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** A set of checkboxes under one name, which is how every grid is chosen here. */
export function Choices({ name, options, checked = [], legend, hint }) {
  const on = new Set(checked);
  return (
    <fieldset>
      <legend>{legend}</legend>
      {hint && <p className="why" style={{ margin: "0 0 8px" }}>{hint}</p>}
      <div className="checks">
        {options.map(option => (
          <label key={option.value}>
            <input type="checkbox" name={name} value={option.value}
                   defaultChecked={on.has(option.value)} />
            <span>{option.label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
