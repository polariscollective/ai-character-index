/* The one route open to the internet that writes.
 *
 * It records a proposal and tells us about it. It registers nothing, judges
 * nothing, and spends nothing -- every proposal costs money to act on, and a
 * public route that could spend it would be a public route that spends it.
 *
 * Answers a plain form post with a redirect, so the page needs no JavaScript to
 * submit and the outcome survives a reload. */
import {
  PER_HOUR, announce, asMarkdown, behaviourProblems, callerAddress, record,
  recentFrom, sourceHash, specificationProblems,
} from "../../lib/submissions.mjs";

const PAGE = "/propose.html";

function back(request, outcome) {
  const url = new URL(PAGE, request.url);
  for (const [key, value] of Object.entries(outcome)) if (value) url.searchParams.set(key, value);
  // 303, so the browser follows with GET and a reload does not send it twice.
  return Response.redirect(url, 303);
}

const text = (fields, name) => {
  const value = fields.get(name);
  return typeof value === "string" ? value.trim() : "";
};

export async function POST(request) {
  let fields;
  try {
    fields = await request.formData();
  } catch {
    return back(request, { problem: "that was not a form" });
  }

  // Hidden from people, filled in by machinery that posts to every form it
  // finds. Answered exactly as a real submission is, and recorded nowhere:
  // saying "refused" would teach the next attempt what to leave blank.
  if (text(fields, "website")) {
    return back(request, { done: "Thank you. We read every proposal." });
  }

  const kind = text(fields, "kind");
  if (kind !== "behaviour" && kind !== "specification") {
    return back(request, { problem: "say whether this is a behaviour or a specification" });
  }

  const hash = sourceHash(callerAddress(request.headers));
  try {
    if (await recentFrom(hash) >= PER_HOUR) {
      return back(request, {
        problem: `That is ${PER_HOUR} proposals within the hour from here, which is as `
               + "many as this form takes. The ones already sent are safe; try again later.",
      });
    }
  } catch (error) {
    // The rate-limit read failing must not refuse an honest proposal.
    console.error(`submit: counting recent proposals failed: ${error.message}`);
  }

  const email = text(fields, "email");
  let proposal, document = null;

  if (kind === "behaviour") {
    proposal = {
      name: text(fields, "name"),
      query: text(fields, "query"),
      boundary: text(fields, "boundary"),
      why: text(fields, "why"),
    };
    const found = behaviourProblems({ ...proposal, email });
    if (found.length) return back(request, { problem: found.join("\n") });
  } else {
    proposal = {
      organisation: text(fields, "organisation"),
      name: text(fields, "name"),
      version: text(fields, "version"),
      source_url: text(fields, "source_url"),
      why: text(fields, "why"),
    };
    const file = fields.get("document");
    const found = specificationProblems({ ...proposal, email }, file);
    if (found.length) return back(request, { problem: found.join("\n") });
    document = await file.text();
    const refusal = asMarkdown(document);
    if (refusal) return back(request, { problem: refusal });
  }

  let row;
  try {
    row = await record({ kind, proposal, document, submitter: email, hash });
  } catch (error) {
    console.error(`submit: ${error.stack || error}`);
    return back(request, {
      problem: "Something on our side would not take that. Nothing was recorded, "
             + "so it is worth trying again.",
    });
  }

  const silent = await announce(row);
  if (silent) console.error(`submit: proposal ${row.id} recorded, not announced: ${silent}`);

  return back(request, {
    done: kind === "behaviour"
      ? "Thank you. The behaviour is with us. Running it against the specifications "
        + "is a decision a person makes, so you will not see it in the reader today."
      : "Thank you. The document is with us. Judging it is a decision a person "
        + "makes, so you will not see it in the reader today.",
  });
}
