/**
 * Whether a run may be launched: the rule the Runs page and its route share.
 *
 * Launching and retrying are the same act. The judging job takes every call of a
 * run that is not done, so a run that came back with failures is retried by
 * launching it again. What decides whether that is allowed is therefore what its
 * calls say, not what the run says: a run is marked done once every call has come
 * back, failed or not.
 */

/** Rows counted by their status. */
export const byStatus = (rows) => rows.reduce((counts, row) => {
  counts[row.status] = (counts[row.status] || 0) + 1;
  return counts;
}, {});

/** How many calls a launch would attempt. */
export function unfinished(counts) {
  return Object.entries(counts || {})
    .reduce((total, [status, count]) => (status === "done" ? total : total + count), 0);
}

/** Tallies as one: a run's work is its passage calls and its depths. */
export function mergeCounts(...tallies) {
  return tallies.reduce((total, tally) => {
    for (const [status, count] of Object.entries(tally || {})) {
      total[status] = (total[status] || 0) + count;
    }
    return total;
  }, {});
}

/** Why a run cannot be launched, or null when it can. */
export function launchRefusal(run, counts) {
  if (!run) return "no such run";
  if (run.status === "running") return "that run is already running";
  if (unfinished(counts) === 0) {
    return "every call of that run is done. Compose a new run to judge more cells, "
         + "or to judge these again.";
  }
  return null;
}
