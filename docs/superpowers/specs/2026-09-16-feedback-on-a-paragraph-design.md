# Feedback on a paragraph

> Design doc, 2026-09-16. How a reader tells us what they think of one paragraph
> of a specification, and what happens to what they say.

## The problem

The index reads documents in public and says things about them: this paragraph
is where the constitution addresses proportionate risk mitigation, this one is
not. Every one of those claims is a panel's reading, and a reader who disagrees
with one has nowhere to say so. The proposal form takes a new behaviour or a new
document; it does not take "you have got this paragraph wrong", which is the
smallest and most common thing a reader has to offer.

Two things are being asked for at once, and the design keeps them apart:

- **a sentence**, from someone who read the paragraph and the highlight over it;
- **a thumb**, from someone who will not write a sentence but will spend one
  click.

The second is worth taking because most readers are the second kind. It is worth
taking carefully, because a thumb with no text is a vote, and a table of votes
becomes a number on a page, and a number on a page is a claim.

## What it is

A third icon beside "copy locator" and "copy link", on every paragraph of every
document. It opens a dialog. The dialog takes a comment, a thumb, an address,
and one decision about who may see what.

Nothing is displayed anywhere yet. What a reader permits is recorded now so that
the surface, when it exists, can be built from consent that was actually given
rather than assumed after the fact.

```
Feedback on this paragraph                                    x
openai--model-spec@2026-08-18 > #levels_of_authority > ¶2

Behaviours highlighting it
[ Helpfulness, Proportionate risk mitigation            ] readonly

Does the index get this paragraph right?  (optional)
[ thumb up  Yes ]   [ thumb down  No ]

Your comment  (optional)
[                                                       ]

Your address
[ you@example.org                                       ]
We use it to write back. It is never shown on the site.

How may we use this?
 (o) Keep it private
     Only we read it.
 ( ) Show it, without my name
     The comment and the vote may appear on the site.
 ( ) Show it, and say it came from me
     Name to show [            ]  Your address stays private.

                                    [ Cancel ]  [ Send feedback ]
```

## Where the icon goes, and why that is one change and not two

The reader draws the two copy icons from one markup constant, used twice: in the
head of a cited passage, and in the floating toolbar that follows the pointer
across the paragraphs no passage cites (`COPY_ICONS`, `BLOCK_COPY`,
`setupBlockCopy` in `site/spec-reader/app.js`). The feedback button joins that
constant, so it appears on cited passages and on ordinary paragraphs from a
single addition, and inherits the reveal-on-hover, reveal-on-focus and
reveal-on-tap behaviour the copy icons already have.

It inherits the exclusions too, and they are right: no icons on a heading, which
carries no locator and so could not name what the feedback is about, and none on
a code block or a table, which scroll sideways and would clip them.

The icon is an inline SVG speech bubble on the same 16-unit grid, 1.4 stroke,
`currentColor`, like its two neighbours. The framework carries no icon library
and no emoji, and this does not introduce one.

## What a submission says, and what it is allowed to omit

| Field | Required | Note |
|---|---|---|
| the locator | always, taken from the paragraph | never typed, never editable |
| the publication | always, resolved by the route | see below |
| behaviours | when the paragraph is cited | shown readonly, never typed |
| a comment | no | |
| a thumb | no | |
| an address | yes | never shown on the site |
| a visibility | yes, defaulting to private | |
| a name to show | only when the visibility is `attributed` | |

A submission carrying neither a comment nor a thumb is nothing at all and is
refused. Everything else is a reader's choice.

**The address is required.** It is the one field that makes a reply possible, and
a retort that cannot be answered is worth less to both sides. The cost is paid
once: the address is remembered in the browser after the first send.

**The behaviours field is the intersection**, not the menu. Of the behaviours
ticked in the sidebar, it names the ones that cite this paragraph, which is
exactly the set the reader can see colouring the text in front of them. The
whole block is absent on a paragraph no selected behaviour cites; a field that
listed behaviours with no visible relation to the paragraph would assert a link
the page does not draw.

It is `readonly` rather than `disabled`. Both refuse the mouse and the keyboard
equally; `disabled` also drops the field out of the tab order and silences it for
some screen readers, which would hide from one reader the context every other
reader gets.

## Which publication, and why the locator is not enough

A locator carries the document and its version: `<lab>--<document>@<version>` is
its head, and two versions of one lab's document are two documents. So a locator
identifies the text without help.

What it does not identify is the reading. The behaviours, their citations and the
bands over them come from a published payload, and a reader looking at a pinned
publication is looking at a different set of claims from a reader on the current
one. "This highlight is wrong" is a statement about a publication.

The route resolves it rather than trusting the page: the `?publication=` pin when
the reader sent one and the row exists, and otherwise the current publication,
resolved exactly as the payload route resolves it. The payload's own bytes are
held to a stored digest, so the publication's id cannot be added to them.

`publication_id` carries **no foreign key**. A publication can be archived out of
`aci_publications` and removed (this happened on 16 September 2026 to the
inherited publication and five drafts), and a reader's words must survive the
cleanup of something they commented on.

## Who may see it

One decision, three states, written as three radio choices, each saying what it
permits. Private is the default and the default is not an absence: it is the
first choice, selected, in words.

| Stored | The reader chose | What it permits |
|---|---|---|
| `private` | Keep it private | nobody outside the collective reads it |
| `anonymous` | Show it, without my name | the comment and the vote may be published, unattributed |
| `attributed` | Show it, and say it came from me | the same, beside a name the reader typed |

**The address is never public, at any level.** What is shown at `attributed` is a
`display_name` the reader types for the purpose. An email address published as
given is harvested within days, and that is a cost we would be imposing on
somebody who did us a favour; a name they chose is the thing they meant to
volunteer anyway.

The name is required when `attributed` is chosen. Leaving it empty and being
published as "anonymous" would quietly overrule a choice the reader made, so the
form refuses with a plain sentence: "Type the name to show, or choose 'without my
name'." The database carries the same rule as a check constraint, so the two can
never disagree.

## The table

```sql
create table aci_feedback (
  id             uuid primary key default gen_random_uuid(),
  created_at     timestamptz not null default now(),

  -- Which build of the index was on screen. No foreign key: a publication can be
  -- archived out of aci_publications, and a reader's words outlive it.
  publication_id uuid,

  locator        text not null,
  document_id    text not null,     -- the locator's head, so a document groups
  behaviours     text[] not null default '{}',

  vote           text check (vote in ('up', 'down')),
  comment        text not null default '',

  submitter      text not null,     -- the address. Never shown on the site.
  display_name   text not null default '',
  visibility     text not null default 'private'
                 check (visibility in ('private', 'anonymous', 'attributed')),

  source_hash    text not null,
  status         text not null default 'new'
                 check (status in ('new', 'read', 'actioned', 'declined')),
  notes          text not null default '',

  -- A thumb alone is a submission; nothing at all is not.
  check (comment <> '' or vote is not null),
  -- A name is shown exactly when somebody asked to be named.
  check ((visibility = 'attributed') = (display_name <> ''))
);

create index aci_feedback_recent on aci_feedback (created_at desc);
create index aci_feedback_by_source on aci_feedback (source_hash, created_at desc);
create index aci_feedback_by_locator on aci_feedback (locator);

grant select, insert, update on public.aci_feedback to service_role;
```

`document_id` is the locator's head and so is derivable from it, in SQL as in
JavaScript. It is stored because every question worth asking of this table is
asked per document ("what did readers say about the model spec?"), and a
`split_part` in every one of them is a filter no index helps.

`vote` is `'up'` / `'down'` rather than `1` / `-1`. A thumb is not a quantity and
summing it is a decision nobody has made yet; two words read correctly in a query
result, where two signed integers invite an average.

The grant is `service_role` only, and that is what "public in write, private in
read" means here: the route is public, the table is not. The write path is the
same one `aci_submissions` uses, with the same consequence, that the whole of
this table's protection is the secrecy of the service key plus what the route
checked first.

An anon key with an insert-only RLS policy would make the table itself
publicly writable, which is the literal reading of the requirement. It is
rejected: it puts a key in a page that is served to everybody, it makes the rate
limit unenforceable, and this deployment has no anon-key path to reuse.

## What an unauthenticated route has to survive

The second route of this application open to the internet that writes. The
defences are the proposal form's, because they were built for exactly this and
the reasoning has not changed:

1. **A cap per source per hour**, counted from `source_hash` against this table,
   so it needs no second store and survives a cold start. Thirty rather than the
   proposal form's ten: a reader working through a document may legitimately have
   something to say about a dozen paragraphs in a sitting, and nothing about this
   costs money to act on.
2. **A honeypot field**, hidden from people, filled in by machinery that posts to
   every form it finds. A submission carrying it is answered exactly as a real
   one is, and recorded nowhere.
3. **Length caps on every field**: 5000 for the comment, 200 for the address, 100
   for the name, 500 for the locator, and at most 20 behaviour names of 200
   characters each. An unbounded text field on an open route is a way to fill a
   database.
4. **A request-size cap read from Content-Length** before the body is buffered,
   64 KB. There is no file here, and the caps above add up to a few kilobytes;
   a body larger than this is refused without being read.

`source_hash` is the salted hash `submissions.mjs` already computes, salted with
the service key, and `callerAddress` reads the platform's headers before
`x-forwarded-for`, and reads that one from the right. Both are imported, not
reimplemented: the reasoning behind them is written down once, in the module that
holds them, and a second copy is a second thing to get wrong.

Slack failing must not lose a submission: the row is written first, the message
is sent after, and a webhook that is missing or refuses leaves the row intact and
says so in the log rather than to the reader.

## JSON, not a redirect

`/api/submit` answers a form post with a 303 so that the proposal page needs no
JavaScript and the outcome survives a reload. The reader is the opposite case: it
is an application, it has already fetched three payloads, and a navigation would
throw away the document position, the behaviour selection and the compare view
the reader had arranged. So `/api/feedback` takes JSON and answers JSON, and the
dialog reports the outcome in place.

The consequence is honest and worth stating: this form does not work without
JavaScript. Neither does the reader it lives in.

## What the browser remembers

Three values, after the first send: the address, the name to show, and the
visibility. In `localStorage`, under `aci-feedback-email`, `aci-feedback-name`
and `aci-feedback-visibility`, wrapped in `try/catch` like the palette the reader
already stores, because a browser may refuse it and a refusal must not break the
dialog.

`localStorage`, not `sessionStorage`: they are not the same thing.
`sessionStorage` is cleared when the tab closes, `localStorage` survives the
browser being quit. What is being remembered is a person's address and their
standing decision about publication, and both are answers they should not have to
give twice next week.

Nothing else is remembered. In particular the browser does not record what was
already sent: every send is a row, by decision, and a paragraph can be commented
on twice.

## Where it is read

`/admin/feedback`, on the model of `/admin/submissions`: newest first, the
comment, the thumb, the locator as a link that opens the reader at that passage,
the behaviours, the visibility as the reader set it, the address, and controls to
move the status. Slack carries the same thing as a message when it arrives,
through the webhook the proposal form already uses.

## What it deliberately does not do

- **No display.** Not a count, not a list, not a thumb tally on a paragraph. The
  data is being gathered so the question can be decided with something in hand.
- **No deduplication.** Every send is a row. Whatever is eventually displayed
  will have to decide what a person's second thumb on the same paragraph means,
  and that decision belongs to the display, not to the intake, which cannot see
  the reasoning.
- **No verification of the address**, no account, no sign-in. The proposal form
  made the same call for the same reason.
- **No edit and no withdrawal.** What was sent was sent. A reader who wants to
  correct themselves sends again, and both rows are there.
- **No moderation.** The comment is somebody's words, stored as given. Nothing
  reaches the public without a person choosing to put it there, so there is
  nothing yet for moderation to protect.

## What this touches

| File | What |
|---|---|
| `polaris-supabase`, a new migration | the table above |
| `app/lib/feedback.mjs` | validation, caps, publication resolution, the Slack message |
| `app/api/feedback/route.js` | the route |
| `app/lib/submissions.mjs` | `recentFrom` generalised to count in either table |
| `site/spec-reader/index.html` | the dialog's markup |
| `site/spec-reader/app.js` | the icon, opening and filling the dialog, sending, the browser's memory |
| `site/spec-reader/styles.css` | the dialog, the thumbs, the radio group |
| `app/admin/feedback/page.jsx`, `app/api/admin/feedback/route.js` | reading them |
| `app/lib/__tests__/feedback.test.mjs` | the rules, each refusal, Slack's silence |
| `engine/panel/test_appjs_feedback.js` | what the dialog puts in its request body |
| `CLAUDE.md`, `site/OVERVIEW.md`, `site/spec-reader/README.md` | recording it |

## Testing

The route's rules are unit-tested against an injected `fetch`, like every other
route library here: an address that is missing, a submission with neither comment
nor thumb, `attributed` with no name, each length cap, the honeypot answered as a
success and recorded nowhere, the rate limit counting this table, a pin that does
not exist falling back to the current publication, and a Slack webhook that
refuses leaving the row intact.

The dialog is tested the way `app.js` is tested here: the module's functions
loaded in Node and held to what they produce, in `engine/panel/test_appjs_feedback.js`.
What matters there is the body of the request: the right locator for the
paragraph the icon sat on, the intersection of behaviours and not the menu, the
visibility as chosen, and the address travelling in one field only, whatever the
visibility, because the display name is what publication could ever show.
