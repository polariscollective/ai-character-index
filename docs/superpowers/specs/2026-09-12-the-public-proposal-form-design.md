# The public proposal form

> Design doc, 2026-09-12. How someone outside the collective proposes a behaviour
> or a specification, and what happens to it.

## The problem

The index used to take proposals as pull requests. That pathway is gone: the
artifacts live in Supabase, judging costs money and runs on our infrastructure,
and a fork cannot register anything. Nothing replaced it, so today a reader with
a good idea has no way to say so.

This is not the admin portal, and the distinction is the whole design. The portal
spends money: it composes runs, launches judges, and decides what the public sees.
This form spends nothing and decides nothing. It records a proposal and tells us
about it.

## What it is

One public page, `/propose.html`, with two forms.

**A behaviour.** A name, the brief a panel should be given, where the construct
stops, why it is worth testing, and an address to reply to if the proposer wants
one.

**A specification.** The organisation, the document's name, the version label, a
link to the published source, and the document itself as a markdown file.

Both land in three places, and that is the whole of it:

| Where | What |
|---|---|
| Supabase, `aci_submissions` | the proposal, as given, with its state |
| Supabase Storage, `aci-submissions` | the uploaded document, private |
| Slack | a message saying one arrived, and what it says |

Nothing is judged, nothing is registered, and nothing reaches the reader. An
operator reads the proposal in the portal and, if it is worth running, registers
it there — which is where the money is spent and where that decision belongs.

## Why Supabase Storage rather than a bucket in GCP

The obvious reading of "a bucket" is Cloud Storage, and it is the wrong one here.
Vercel has no GCP identity — that is the reason `polaris-batch-trigger` exists —
so writing to a Cloud Storage bucket from a route would mean a new identity path,
new Terraform, and a second set of credentials on the deployment. Supabase Storage
needs none of it: the service role key that already writes the tables writes the
objects, the object lives beside the row that describes it, and a signed link is
one call.

The bucket is private. The Slack message carries a link that expires.

## The table

```sql
create table aci_submissions (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  kind        text not null check (kind in ('behaviour', 'specification')),
  proposal    jsonb not null,
  document    text,
  submitter   text not null default '',
  source_hash text not null,
  status      text not null default 'new'
              check (status in ('new', 'reviewing', 'accepted', 'declined')),
  notes       text not null default ''
);
```

`proposal` holds the form's fields as they were given, not as we would like them.
A proposal is somebody's words, and normalising them on the way in loses the thing
an operator needs to read.

`source_hash` is a salted hash of the caller's address, never the address. It
exists for one purpose — refusing the tenth submission in an hour from one place —
and an address that can be read back would be a record of who read the site,
which this project has no business keeping.

## What an unauthenticated route has to survive

The form is open to the internet, writes to a database, uploads a file, and pings
Slack. Four defences, each against a specific abuse:

1. **A size cap on the document**, 2 MB. The largest specification the index
   carries is a tenth of that.
2. **Markdown only.** The upload is read as text and refused if it is not; nothing
   is served from the bucket, so a hostile file has nowhere to execute, but a
   bucket of binaries is still not what this is for.
3. **A cap per source per hour.** Counted from `source_hash` against the table
   itself, so it needs no second store and survives a cold start.
4. **A honeypot field**, hidden from people and filled in by the machinery that
   posts to every form it finds. A submission carrying it is answered exactly as a
   real one is, and recorded nowhere.

Slack failing must not lose a proposal: the row is written first, the message is
sent after, and a webhook that is missing or refuses leaves the submission intact
and says so in the log rather than to the proposer.

## Where it is read

`/admin/submissions` lists them, newest first, with the document's signed link and
controls to move the state. Reading a proposal is not registering it: the operator
retypes what they accept into the registration form, which is the moment a
person's words become the index's.

## What it deliberately does not do

- No account, no sign-in, no verification of the address given. The proposal is
  judged on its content.
- No automatic registration, and no automatic run. Every proposal costs money to
  act on, and a public form that could spend it would be a public form that
  spends it.
- No edit and no withdrawal. A proposal is a message that was sent.
