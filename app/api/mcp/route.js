/**
 * The public MCP server.
 *
 * Read-only tools over the published index, unauthenticated, on the same
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
import { linkEvidence } from "../../lib/links.mjs";
import { about, listModelSpecs, listBehaviours, retrievePassages,
         compareDocuments, INSTRUCTIONS, ToolError }
  from "../../lib/mcp-tools.mjs";
import { constitutionsBoard, governanceBoard, overviewBoard } from "../../lib/board-tools.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* The address of the site this deployment serves, for the citation `about`
 * hands back. Read from the platform rather than written down: a domain can
 * move, and a URL frozen in prose would go on naming the old one with nothing
 * to say so. A deployment that knows no address of its own gives none, and the
 * answer names the path instead. Read per call rather than at module load, so a
 * long-lived instance cannot answer from the value it booted with. */
const site = () => {
  const host = process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL;
  return host ? `https://${host}` : null;
};

/** JSON in one text block, prose as itself, and a caller's mistake reported as one. */
async function answer(work) {
  try {
    const answered = await work(await indexSnapshot());
    return {
      // `about` answers in prose and the rest in JSON. Stringifying prose would
      // hand an agent a quoted blob to unescape before it could read a word.
      content: [{
        type: "text",
        text: typeof answered === "string" ? answered : JSON.stringify(answered, null, 2),
      }],
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
  + "related bears on it without establishing it. Defaults to related, so every "
  + "band comes back, which is what the doc reader shows before any toggle is "
  + "touched. Every passage carries its strength, so pass core or defining to "
  + "narrow the answer. A judge's own verdict of adjacent is the band named "
  + "related here.";

const handler = createMcpHandler(
  server => {
    /* First in the list, because that is the whole of the design. A client that
     * never shows `instructions` to the model leaves the tool list as the only
     * introduction there is, and an agent reads a list from the top. */
    server.registerTool("about", {
      title: "About this index",
      description: "Start here to understand this index and its other tools.",
      inputSchema: z.object({}),
    }, () => answer(snapshot => about(snapshot, { site: site() })));

    server.registerTool("list_model_specs", {
      title: "List constitutions",
      description:
        "Every constitution (model specification) the current publication carries: laboratory, "
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
        + "came from, and per specification how many passages it has, the "
        + "strongest band any of them reaches and the panel's depth. Where a judge "
        + "could not answer a specification at all and another model took its "
        + "seat, that specification carries substitutions naming the seat, the "
        + "substitute and the reason. Takes no arguments. Use the slugs "
        + "it returns as the behaviours argument of retrieve_passages.",
      inputSchema: z.object({}),
    }, () => answer(snapshot => listBehaviours(snapshot)));

    server.registerTool("retrieve_passages", {
      title: "Retrieve passages",
      description:
        "The passages of one or more constitutions (model specifications) that bear on one or "
        + "more behaviours, quoted verbatim with a locator, the band the panel "
        + "put them in and each judge's verdict. Answers in whole behaviour and "
        + "specification pairs, strongest passage first, never splitting a pair "
        + "across pages. Where a pair carries a depth, it is the mean the index's "
        + "panel gave it, on the scale the publication names (0 to 10, or 0 to 4 "
        + "on earlier publications); a pair with no depth answers null. Where a judge "
        + "could not answer a pair at all, another model judged it in that seat, "
        + "and the pair carries substitutions naming the seat, the substitute and "
        + "the reason; that seat's verdicts and depth are then the substitute's. "
        + "A depth a substitute gave on its own is marked on that judge's entry of "
        + "the depth, with the model and the reason.",
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

    server.registerTool("constitutions_board", {
      title: "The board of constitutions",
      description:
        "How far each AI company's published constitution goes. A constitution "
        + "is the document in which a company sets out how its models are meant "
        + "to behave, such as Claude's Constitution, the OpenAI Model Spec or "
        + "the Alibaba Model Spec. This tool reads those documents; "
        + "governance_board scores what the companies do around them instead. A "
        + "company that publishes no constitution is on the board at nought and "
        + "says so.\n\n"
        + "Each company answers with a final score out of 10, the average of two "
        + "halves, each counting for half, and is ranked by it.\n\n"
        + "The document as a whole, out of 10, is the average of five criteria, each "
        + "given from 0 to 4 and shown out of 10: clarity when two rules are "
        + "contradictory, how firm each rule is and who may lift it, whether the "
        + "rules say why they exist, which of the situations a model is used in "
        + "have rules of their own, and unsettled contradictions between rules.\n\n"
        + "The behaviours, out of 10, are the average of how far the constitution "
        + "goes on each behaviour the index carries, grouped under honesty and "
        + "epistemics, harm and safety, autonomy, oversight and authority, and "
        + "helpfulness and judgement. The "
        + "scale is 0 absent, 2 named, 4 discussed, 6 prescribed, 8 demonstrated "
        + "with worked examples, and 10 bounded, which asks that the edge be "
        + "shown, that a clash with another of the document's own rules be "
        + "settled, and that a default be given for the case the model cannot "
        + "tell apart. An odd figure means the level below is fully met and the "
        + "one above only in part.\n\n"
        + "Every figure comes back with the level it reads as, what the document "
        + "says on that row and why the figure is what it is, so a figure can be "
        + "read without a second call. The answer is the board the publication "
        + "froze, the same one the front page shows, with its takeaways.\n\n"
        + "Pass company to narrow to one, such as OpenAI. This is the board on "
        + "the index's front page. The whole board runs to a few tens of "
        + "thousands of characters.",
      inputSchema: z.object({
        company: z.string().optional().describe(
          "One company's name, or part of it, such as OpenAI. Every constitution "
          + "by default."),
      }),
    }, args => answer(snapshot => constitutionsBoard(snapshot, args)));

    server.registerTool("governance_board", {
      title: "The board of governance",
      description:
        "How openly each of nine AI companies governs the rules it gives its "
        + "models. A constitution here is the document in which a company sets "
        + "out how its models are meant to behave, such as Claude's Constitution "
        + "or the OpenAI Model Spec. This tool does not read those documents, it "
        + "scores what the company does around them; constitutions_board reads "
        + "the documents themselves. The nine are OpenAI, Anthropic, Alibaba, "
        + "Google DeepMind, Mistral AI, Meta, xAI, Moonshot AI and DeepSeek.\n\n"
        + "Each company answers with a final score out of 10, which ranks the "
        + "companies, and the two figures out of 10 it averages, each counting "
        + "for half.\n\n"
        + "What is published, out of 10, scores what anyone can go and read "
        + "today. It is eleven "
        + "rows: ten checks grouped under four questions, each check scored 0 to "
        + "4, plus one on the licence the text carries. The four questions ask "
        + "whether the company publishes a constitution at all and for which "
        + "models, whether it keeps a dated log of the changes it makes to it, "
        + "what it says about the filters and classifiers that sit outside the "
        + "model, and which of its rules it declares can never be lifted.\n\n"
        + "What it engages, out of 10, scores what a company states about its "
        + "own practice, over eight rows scored 0, 1 or 2: training the models "
        + "it deploys on the constitution, holding its internal models to it, "
        + "publishing the text it actually uses, checking and reporting "
        + "violations in production, publishing a current test of adherence, "
        + "giving outside evaluators access to test adherence, announcing an "
        + "adherence threshold before a release, and naming who approves a "
        + "change to the text.\n\n"
        + "Every row comes back with its figure, the wording that figure was "
        + "given against, and the passage or address it rests on. The answer "
        + "also carries a written paragraph on each company and why both figures "
        + "stay on the board beside the final score.\n\n"
        + "Every document the board rests on has a code: two letters for the "
        + "company (OA for OpenAI, CO for a document on several companies) and a "
        + "number. The texts cite them after a sentence as [OA3], each quoted "
        + "passage names its document in ref, and sources lists every document "
        + "the answer can cite, with its address, its date and the passages "
        + "quoted from it.\n\n"
        + "These were scored by hand by Polaris Collective from public "
        + "documents, on a date the answer names. The board is the one the "
        + "publication froze. A nought means nothing public was found, "
        + "not that the company does not do the thing.\n\n"
        + "Pass company to narrow to one. All nine come to about 455,000 "
        + "characters, sources included; one company to between 67,000 and "
        + "104,000.",
      inputSchema: z.object({
        company: z.string().optional().describe(
          "One company's name, or part of it, such as Anthropic. All nine by "
          + "default."),
      }),
    }, args => answer(snapshot => governanceBoard(snapshot, args)));

    server.registerTool("overview_board", {
      title: "The overview",
      description:
        "The grid the index's site opens on: for each of nine AI companies, "
        + "the few figures that sum up the two boards, what its constitution "
        + "says (the document as a whole, the behaviours it covers, and their "
        + "final score) and how it governs it (what it publishes, what it "
        + "engages, and their final score), each out of 10 and placed in a tier "
        + "against the best score on the same row. With them come the "
        + "overview's takeaways and a short written summary of each company.\n\n"
        + "Every figure is the one constitutions_board or governance_board gives, "
        + "read from the same publication, so call those for what a figure rests "
        + "on. Pass company to narrow to one, such as Anthropic.",
      inputSchema: z.object({
        company: z.string().optional().describe(
          "One company's name, or part of it, such as Anthropic. Every company by "
          + "default."),
      }),
    }, args => answer(snapshot => overviewBoard(snapshot, args)));

    server.registerTool("compare_documents", {
      title: "Compare two documents on one behaviour",
      description:
        "Everything one run found between two constitutions (model specifications) on one "
        + "behaviour: each document's passages quoted with the band the panel "
        + "put them in, every pair of passages the judges linked with the "
        + "relation each judge gave, who may lift each rule and the judge's own "
        + "reasoning, the arbiter's verdict wherever two judges disagreed, the "
        + "passages one document has nothing facing, and the paragraph written "
        + "from all of it. A relation is named by the document it is about and "
        + "never by a direction: stricter arrives with stricter_document. "
        + "THIS ANSWER IS VERY LONG: hundreds of thousands of characters where "
        + "both documents cover the behaviour fully, and it comes whole rather "
        + "than in pages. The first pair measured came to 315,569 characters, "
        + "about 79,000 tokens. Pass detail counts first: it costs about 2,600 "
        + "characters, reports the exact size of the full answer rather than an "
        + "estimate of it, and lets you decide whether to ask for the whole "
        + "thing.",
      inputSchema: z.object({
        behaviour: z.string().describe(
          "One behaviour slug, from list_behaviours. A comparison is about one "
          + "behaviour."),
        model_spec_ids: z.array(z.string()).length(2).describe(
          "Exactly two specification ids, from list_model_specs. A comparison "
          + "is between two documents."),
        detail: z.enum(["counts", "full"]).optional().describe(
          "full by default, which is everything. counts answers instead with "
          + "how many passages each document carries, how many pairs were "
          + "linked, the tally of relations, how many were arbitrated, how many "
          + "silences there are, and full_answer_characters: the exact size of "
          + "the full answer, not an estimate of it."),
      }),
    }, args => answer(async snapshot => compareDocuments(
      snapshot,
      await linkEvidence(args.behaviour, args.model_spec_ids),
      args)));
  },
  {
    serverInfo: { name: "ai-constitutions-index", version: "1.0.0" },
    instructions: INSTRUCTIONS,
  },
);

export { handler as GET, handler as POST, handler as DELETE };
