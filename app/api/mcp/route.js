/**
 * The public MCP server.
 *
 * Three read-only tools over the published index, unauthenticated, on the same
 * application that serves the reader. Nothing here is disclosed that the
 * reader's own routes do not already serve to anyone who loads the page: this
 * is a second shape over the same rows, not a second door into the database.
 *
 * The wire protocol is mcp-handler's problem. This repository writes its own
 * PostgREST calls because it controls that interface; the MCP transport is an
 * external specification with many clients, and the value of a public server
 * is that an unfamiliar one connects on the first try.
 */
import { createMcpHandler } from "mcp-handler";
import { z } from "zod";
import { indexSnapshot } from "../../lib/index-snapshot.mjs";
import { listModelSpecs, listBehaviours, retrievePassages, ToolError }
  from "../../lib/mcp-tools.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const INSTRUCTIONS = `The AI Character Index reports where model specifications
address a behaviour, and how strongly. It holds published specifications, a set
of behaviours, and passages of those specifications that a panel of language
model judges marked as bearing on each behaviour.

A passage carries a strength: defining is the document's fullest statement of
the behaviour, core establishes it there, related bears on it without
establishing it. Every passage is quoted verbatim at the version named in the
answer.

Passage counts are not a like-for-like measure between laboratories. Some
behaviours were swept by more judges against one document than another, so that
document surfaced more candidate passages. Any answer spanning more than one
specification says so in the response.

Start with list_behaviours to learn the slugs, then retrieve_passages.`;

/** JSON in one text block, and a caller's mistake reported as one. */
async function answer(work) {
  try {
    return {
      content: [{ type: "text", text: JSON.stringify(await work(await indexSnapshot()), null, 1) }],
    };
  } catch (error) {
    // A ToolError is the caller's; anything else is ours, and its message may
    // carry a query string, so it does not travel.
    const message = error instanceof ToolError
      ? error.message
      : "the index could not be read";
    if (!(error instanceof ToolError)) console.error("mcp:", error);
    return { content: [{ type: "text", text: message }], isError: true };
  }
}

const STRENGTH =
  "The weakest band to return, meaning that band and stronger. defining is the "
  + "document's fullest statement of the behaviour, core establishes it there, "
  + "related bears on it without establishing it. Defaults to core, which is "
  + "what the spec reader shows before any toggle is touched.";

const handler = createMcpHandler(
  server => {
    server.registerTool("list_model_specs", {
      title: "List model specifications",
      description:
        "Every model specification the current publication carries: laboratory, "
        + "title, version, source URL, how many behaviours were judged against "
        + "it and how many passages it holds. Takes no arguments. Does not "
        + "return the specification text, which runs to hundreds of kilobytes; "
        + "follow source_url for that.",
      inputSchema: z.object({}),
    }, () => answer(snapshot => listModelSpecs(snapshot)));

    server.registerTool("list_behaviours", {
      title: "List behaviours",
      description:
        "Every behaviour the current publication shows, with the brief the judge "
        + "panel was given, the boundary of the construct, where the definition "
        + "came from, and per specification how many passages it has and the "
        + "strongest band any of them reaches. Takes no arguments. Use the slugs "
        + "it returns as the behaviours argument of retrieve_passages.",
      inputSchema: z.object({}),
    }, () => answer(snapshot => listBehaviours(snapshot)));

    server.registerTool("retrieve_passages", {
      title: "Retrieve passages",
      description:
        "The passages of one or more model specifications that bear on one or "
        + "more behaviours, quoted verbatim with a locator, the band the panel "
        + "put them in and each judge's verdict. Answers in whole behaviour and "
        + "specification pairs, strongest passage first, never splitting a pair "
        + "across pages. Passage counts are NOT comparable between laboratories: "
        + "some behaviours were swept by more judges against one document than "
        + "another, and any answer spanning more than one specification says so.",
      inputSchema: z.object({
        behaviours: z.array(z.string()).min(1).describe(
          "Behaviour slugs, from list_behaviours. Required: it is what bounds "
          + "the size of the answer."),
        model_spec_ids: z.array(z.string()).optional().describe(
          "Specification ids, from list_model_specs. Every specification by default."),
        strength: z.enum(["defining", "core", "related"]).optional().describe(STRENGTH),
        limit: z.number().int().min(1).max(200).optional().describe(
          "The page budget in passages, 40 by default. Pairs are added whole "
          + "until the budget is reached; a pair larger than it comes back alone."),
        cursor: z.object({
          publication: z.string(),
          behaviour: z.string(),
          model_spec_id: z.string(),
        }).optional().describe(
          "The next_cursor of the previous page, to continue a walk."),
      }),
    }, args => answer(snapshot => retrievePassages(snapshot, args)));
  },
  {
    serverInfo: { name: "ai-character-index", version: "1.0.0" },
    instructions: INSTRUCTIONS,
  },
);

export { handler as GET, handler as POST, handler as DELETE };
