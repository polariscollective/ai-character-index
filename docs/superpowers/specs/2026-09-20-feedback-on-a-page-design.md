# Feedback on a page

> Design doc, 2026-09-20. A bubble on every public page that photographs what
> the reader is looking at, takes an annotation and a sentence, and files both.

## The problem

Two forms already take words from outside. `/about` takes a proposal, which is
somebody asking us to run something. The reader's paragraph dialog takes a note
about one paragraph, which is somebody disagreeing with a panel's reading.
Neither takes the third and commonest thing anybody has to offer: this page is
broken, this table runs off my phone, this heading says the wrong date.

That report is mostly a picture. A sentence describing a layout fault is a
sentence somebody has to reconstruct into a screen, and half the time they
reconstruct a different one. What closes the gap is the screen itself, with a
box drawn round the part that is wrong.

## What it is

A pill fixed to the bottom right of the four public pages. Pressing it hides
the pill, photographs the viewport, and opens a dialog with that photograph
inside it, ready to be drawn on.

```
Tell us what you see                                              x

  [ Box ] [ Arrow ] [ Pen ]   [ rust ] [ chartreuse ]   Undo  Clear

  +-------------------------------------------------------------+
  |                                                             |
  |   the page, as it was a moment ago, with a rust box drawn   |
  |   round the part that is wrong                              |
  |                                                             |
  +-------------------------------------------------------------+
                                            Drop the screenshot

  What you want to tell us
  [                                                              ]

  Your address
  [ you@example.org                                              ]
  Your note, your address and this screenshot stay private. We use
  your address only to write back.

  Sent with this: the address of this page, the size of your
  window, and your browser's identification string.

                                      [ Cancel ]  [ Send feedback ]
```

## Why this is not the paragraph dialog with a picture bolted on

`aci_feedback` is about a paragraph, and every column says so: `locator`,
`document_id`, `behaviours`, `vote`. None of them applies to a page, and a page
report has a screenshot, which that table has nowhere to put. Its consent model
is three-valued because a note about a paragraph might one day be shown beside
that paragraph; a screenshot of somebody's browser never will be, so this one
is private, full stop, and says so rather than asking.

So: a second table, a second bucket, a second route, and the guards shared
rather than copied.

## Where the bubble goes

`site/page-feedback.js`, a fifth shared module beside `dev-tag.js` and
`brand.js`, added to `overview.html`, `about.html`, `mcp.html` and
`spec-reader/index.html` as one `<script type="module">` line each. It builds
everything as nodes, so a page gains a script tag and nothing else, which is
the precedent `dev-tag.js` set and the reason it is one file rather than four
copies.

Not the portal. `/admin` is a surface whose operators can write to us by any
means they like; the bubble is for people who cannot.

Bottom right is free on all four pages. The reader's fixed furniture is a skip
link at top left and four popovers cornered from the control that opened them
(`.depth-note`, `.key-note`, `.spec-picker`, `.original-note`); none of them
sits permanently in that corner.

Colours are hard-coded Polaris tokens rather than read from the host page, as
`dev-tag.js` hard-codes them. The reader carries its own umber palette where
`--ink` is a cream, so inheriting would give the bubble a different look on one
page in four.

## The capture

### What region

The visible viewport, not the whole document. That is what "a screenshot of the
page" means to the person pressing the button, and the reader scrolled out to
its full height is twenty thousand pixels of nothing anybody asked for.

```js
html2canvas(document.body, {
  x: window.scrollX,
  y: window.scrollY,
  width: document.documentElement.clientWidth,
  height: document.documentElement.clientHeight,
  windowWidth: window.innerWidth,
  windowHeight: window.innerHeight,
  scale: Math.min(2, window.devicePixelRatio || 1),
  logging: false,
  useCORS: true,
  onclone,
})
```

`clientWidth` rather than `innerWidth` for the crop, so a desktop scrollbar does
not become a strip of nothing down the right edge.

### The library, and how it is loaded

html2canvas 1.4.1, vendored as `site/vendor/html2canvas.min.js` and injected by
a `<script>` tag the first time the bubble is pressed. Nothing is fetched on
page load, so the four pages carry no cost until somebody wants to say
something.

Vendored rather than fetched from a CDN, because these pages are static files
with no build step and no third-party script on them today, and a CDN is a
party that can change what it serves. Vendored rather than bundled, because
there is no bundler: `site/` is copied into `public/` by `cp -R` and served.

It is the library the same author already uses in another project, which is
half the reason for choosing it. The other half is that it does not render
through an SVG `foreignObject`: it walks the DOM and draws text with
`fillText`, using the fonts already loaded in the document. The three Google
fonts these pages carry therefore need no inlining, which is the failure mode
that makes the `foreignObject` libraries unusable here.

html2canvas has had no release since 2022. That is a real cost and it is
accepted: `capture_method` is stored on every row so that a later method is
distinguishable from this one in the record, rather than silently replacing it.

### The sticky problem, which is the one that matters

`position: sticky` is used on all four pages: the header on each, the contents
rail on `/about` and `/mcp`, and a table header on `/overview`. html2canvas
draws a sticky element at its static position, so somebody who has scrolled
would send a capture with the header they were looking at missing from the top
and floating somewhere up the page instead.

The fix is the `onclone` hook, which hands us the cloned document before it is
painted. Before capturing, every element whose live computed `position` is
`sticky` is measured and tagged:

```js
for (const node of document.querySelectorAll("*")) {
  if (getComputedStyle(node).position !== "sticky") continue;
  const box = node.getBoundingClientRect();
  node.dataset.pfSticky = JSON.stringify({
    top: box.top + window.scrollY,
    left: box.left + window.scrollX,
    width: box.width,
  });
}
```

`onclone` then reads the tag off each cloned node and pins it absolutely at
that place, and the tags are removed from the live document as soon as the
capture returns. Matching by attribute rather than by walking two trees in
parallel, because the clone is not guaranteed to be node-for-node identical.

This is the part of the work that has to be checked by eye rather than by a
test. Four pages, scrolled to the middle, capture, look.

### Size

The base canvas is rendered at `min(2, devicePixelRatio)`. On send, the base
and the annotations are drawn together onto an output canvas at the base's
natural size and encoded as PNG. If that blob is over 3 MB, it is drawn once
more at half the linear size and re-encoded, once, deterministically.

PNG rather than JPEG because these pages are flat areas of four colours and
sharp text, which is the case PNG compresses well and JPEG smears.

### What it still gets wrong, stated

A dialog or a popover open at the moment of capture. The reader's notes are
`position: fixed` with their corner set inline, which html2canvas does support,
so they are expected to land in roughly the right place; their `::backdrop` is
not rendered at all. Expected, not verified, and worth a look during
implementation rather than a claim here.

## The editor

Three tools: box, arrow, pen. An arrow rather than a bare line, because what
somebody wants to do with a line is point at something.

Two colours: `--fail` `#A0522D` by default, and `--chartreuse` `#B7C94B` for
marks that fall on an olive-deep band, where rust on dark olive cannot be read.
Rust is the framework's only warm colour and it is reserved for failure, which
is what an annotation on a bug report is. No thickness control: 3 CSS pixels,
scaled by the ratio between the image's natural width and its displayed width
so a mark looks the same whatever the capture scale and whatever the screen.

Undo and clear. Annotations are held as a list of shapes in image coordinates
and redrawn on every pointer move, so undo is dropping the last entry rather
than repainting from a stack of bitmaps.

Pointer Events throughout, with `touch-action: none` on the overlay, so mouse,
stylus and finger take one code path.

`Drop the screenshot` removes the image and sends the words alone. Somebody
whose capture caught something they would rather not send should not have to
abandon the message to avoid sending it.

## What is sent, and what is said before it is sent

Three things beyond the words, the address and the image, and all three are
named on the form above the send button rather than collected quietly:

| field | example |
|---|---|
| `page_url` | `https://.../spec-reader/?spec=openai--model-spec@2026-08-18` |
| `viewport` | `1512x857 @2` |
| `user_agent` | the browser's identification string, as given |

`page_url` carries the query string, which is where `?publication=`, `?spec=`
and `?behavior=` live, so the row records what was on screen without a second
column and without a lookup.

Console logs are deliberately not captured. Collecting them means patching
`console` on every page load for every reader, which is a change to what the
four public pages do to everybody in order to serve the few who report a bug.
It is separable, and if it is ever wanted it should be argued for on its own.

## The route

`POST /api/page-feedback`, `multipart/form-data`, following `/api/submit` in
shape because it carries a file: fields `comment`, `email`, `page_url`,
`viewport`, `user_agent`, `capture_method`, `website` (the honeypot), and a
`screenshot` file part that may be absent.

It answers JSON rather than a redirect, following `/api/feedback`: the caller is
a script on a page whose state cost something to arrange, and a navigation would
throw that away.

Everything is in `app/lib/page-feedback.mjs`, one `handle(request, { fetchImpl })`
that can be tested without a server, and `app/api/page-feedback/route.js` is the
six lines that call it.

Order of work, which is the order the other two routes already use: the image
into the bucket first, then the row that describes it, then Slack. A row never
points at an object that is not there, and a Slack failure is a message nobody
got rather than words nobody has.

## The table and the bucket

`aci_page_feedback` in the `evals` project, and a private bucket
`aci-page-feedback`. Migration in `polaris-supabase`, named
`20260920120000_aci_page_feedback.sql`.

```sql
create table aci_page_feedback (
  id             uuid primary key default gen_random_uuid(),
  created_at     timestamptz not null default now(),

  -- The address as the browser had it, query string and all. No publication
  -- column: the pin is already in the URL when there is one, and the URL is
  -- the honest record of what was on screen.
  page_url       text not null,
  comment        text not null,
  submitter      text not null,

  -- The path in the bucket, null when the sender dropped the image.
  screenshot     text,
  -- How the image was obtained. One value today. It is stored so that a later
  -- method is distinguishable in the record rather than silently replacing
  -- this one, the way a run records the digest of the prompt it used.
  capture_method text,

  viewport       text not null default '',
  user_agent     text not null default '',

  -- A salted hash of the caller's address, never the address, for the same
  -- reason as aci_submissions and aci_feedback.
  source_hash    text not null,

  status         text not null default 'new'
                 check (status in ('new', 'read', 'actioned', 'declined')),
  notes          text not null default '',

  constraint aci_page_feedback_says_something check (comment <> ''),
  constraint aci_page_feedback_has_a_sender   check (submitter <> '')
);

create index aci_page_feedback_recent on aci_page_feedback (created_at desc);
create index aci_page_feedback_by_source
  on aci_page_feedback (source_hash, created_at desc);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('aci-page-feedback', 'aci-page-feedback', false, 4 * 1024 * 1024,
        array['image/png'])
on conflict (id) do nothing;

grant select, insert, update on public.aci_page_feedback to service_role;
```

Update is granted because the status moves as somebody reads it. The row itself
is never rewritten.

Objects land at `YYYY-MM-DD/<uuid>.png`: the date so a year of reports is
browsable, the uuid so two captures never meet.

The `Migrations` workflow in `polaris-supabase` has failed on every run since
PR #30 with `Authorization failed for the access token and project ref pair`,
so this one is applied by hand with `supabase db push` from `evals/`, like the
four before it.

## Slack

The same webhook the other two routes use, through `postToSlack`:

- a header, `Feedback on a page`;
- a section with the comment, cut at 700 characters, and the page address;
- an image block whose `image_url` is a signed link to the object, seven days;
- a context line with the sender's address, the viewport, and a link to
  `/admin/page-feedback`, which does not expire.

Seven days is a real cost and it is chosen rather than tolerated: after that
the image goes from the channel's history and the portal link is what is left.
A permanent link would mean a public bucket, and a capture of somebody's
browser can contain anything they had on screen.

One reservation. Slack fetches `image_url` itself and refuses the whole message
if a block displeases it, so a signed URL it will not accept would cost us the
notification entirely. `postToSlack` returns the error rather than throwing, so
the caller retries once without the image block. A report that arrives without
its picture is worth more than a report that does not arrive.

## The portal

`/admin/page-feedback`, a page beside `/admin/feedback`, reading through
`admin-data.mjs` and drawn with `parts.jsx` like its neighbours: arrived, page,
what they said, the sender, a thumbnail linking to a freshly signed URL, and
the status with the same four states and the same transitions the notes page
uses.

The thumbnail is why this page is not optional. A private bucket with no
surface that reads it is a bucket nobody can open.

## The guards

Third public route that writes, third use of the same three defences, imported
rather than copied:

- `callerAddress` and `sourceHash` from `submissions.mjs`, unchanged;
- `recentFrom(hash, fetchImpl, "aci_page_feedback")`, ten per source per hour,
  the proposal form's number rather than the note dialog's thirty, because a
  capture costs storage;
- the honeypot field, answered exactly as a real submission is and recorded
  nowhere;
- `Content-Length` read and refused before a byte of the body is buffered,
  `MAX_REQUEST_BYTES = 4 MB`, under Vercel's own request ceiling.

Field caps: comment 5000, address 200, `page_url` 500, `user_agent` 500,
`viewport` 50, `capture_method` 40. The image is capped twice, at 3 MB by the
sender and at 4 MB by the bucket.

The address regex is the one `feedback.mjs` already holds; it is exported from
there and imported here rather than written a second time.

## Testing

`app/lib/__tests__/page-feedback.test.mjs`, in the shape of `feedback.test.mjs`,
with no network: normalising a form, every field problem at once, the honeypot
answered as success and recorded nowhere, the size cap refusing before the body
is read, the rate limit, a missing screenshot accepted, and the Slack retry
without the image block when the first post is refused.

`tests/test_page_feedback_bubble.py`, in the shape of `test_governance_tab.py`:
each of the four public pages carries the script tag, and the vendored library
is present.

The capture itself is not unit tested. What it produces is a picture, and the
test for a picture is looking at it: four pages, scrolled, captured, compared to
the screen.

## Files

| path | what |
|---|---|
| `site/page-feedback.js` | the bubble, the capture, the editor, the send |
| `site/vendor/html2canvas.min.js` | the library, loaded on first press |
| `site/overview.html`, `about.html`, `mcp.html`, `spec-reader/index.html` | one script tag each |
| `app/lib/page-feedback.mjs` | the route, testable without a server |
| `app/api/page-feedback/route.js` | the six lines that call it |
| `app/lib/feedback.mjs` | exports its address regex |
| `app/lib/admin-data.mjs` | one reader for the new table |
| `app/admin/page-feedback/page.jsx` | where they are read |
| `app/admin/layout.jsx` | one nav entry |
| `app/lib/__tests__/page-feedback.test.mjs` | the route's tests |
| `tests/test_page_feedback_bubble.py` | the four pages carry it |
| `polaris-supabase` | `20260920120000_aci_page_feedback.sql` |
