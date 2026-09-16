# Passage links between two model specs -- implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the index say, for one behaviour and two documents, which passages say the same thing, which is stricter, where they diverge, where they cannot both be obeyed, and where one document is silent.

**Architecture:** A link run mirrors the judging run the repository already has. One call is one behaviour, one source document, one target document, one judge: it is given the source document's defining and core passages for that cell and the whole of the target document, and answers one line per link. Rows land in three new tables. What the panel asserts from three judges is derived at read time, never stored, so a threshold can be redrawn without paying for a new run.

**Tech Stack:** Python 3 standard library only (no packages, as the whole engine is), PostgREST through `engine/store.py`, models through OpenRouter via `harness.resolve`, tests with `unittest`.

## Global Constraints

- **Python is stdlib only.** CI installs nothing on the Python side. No new dependency, in any task.
- **Everything written into the repository is in English**: identifiers, comments, docstrings, commit messages, test names, error strings.
- **British spelling in prose**, and no em-dashes: use commas, colons, full stops, parentheses, or the double hyphen `--` the existing files use.
- **The schema is not in this repository.** `aci_link_runs`, `aci_link_calls` and `aci_links` are created by a pull request in `polaris-supabase`. No migration file is written here.
- **No existing table is read differently or written at all by this work.** `publish.py`, the publication trigger and the reader are untouched.
- **The panel is the index's one panel**, `frontier_fast`, read from `engine/panel/panel-config.json` as `display.panel`. No task offers a panel choice.
- **Tests are discovered, not registered**: any `engine/panel/test_*.py` is run by `python3 -m unittest discover -s engine/panel -p "test_*.py"`, which CI already runs. No workflow file changes.
- **Run every test from the repository root**, which is `/Users/sverbo/Desktop/Codes/Polaris/ai-character-index`.
- The design this implements is `docs/superpowers/specs/2026-09-16-passage-links-between-model-specs-design.md`.

## File Structure

| File | Responsibility |
|---|---|
| `engine/panel/prompts/link-v1.txt` | Create. The judge's instructions: the five relations with their tests, the five forces, the two doubt rules, the reply format. |
| `engine/panel/link_call.py` | Create. One call as a pure function: compose the prompt, parse the reply, shape the rows. No database, no network. |
| `engine/panel/compose_links.py` | Create. Choose the cells, price the run, write `aci_link_runs` and `aci_link_calls`. CLI. |
| `engine/panel/link_job.py` | Create. Execute every call of a run that is not done, write `aci_links`, meter each call. CLI. |
| `engine/panel/link_consensus.py` | Create. What three judges' rows let the index assert, derived at read time. |
| `engine/panel/link_report.py` | Create. One run to a markdown report and a JSON file in `artefacts/`. CLI. |
| `engine/panel/test_link_call.py` | Create. Composition and the parser. |
| `engine/panel/test_compose_links.py` | Create. Cell choice, both directions, pricing, refusals. |
| `engine/panel/test_link_job.py` | Create. The loop, against a fake store and a stub model. |
| `engine/panel/test_link_consensus.py` | Create. The thresholds and the two asymmetries. |
| `engine/panel/test_link_report.py` | Create. The report's shape from a run. |

Each file is one responsibility, and the four modules that do work are pure functions of their arguments wherever they can be, because that is what lets the tests run with no network and no credentials. This is the seam `judge_call.py` and `depth_call.py` already use, and the new files follow their shape closely enough that a reader of one recognises the other.

---

### Task 1: The three tables, in `polaris-supabase`

This task is in a different repository. Nothing in this repository can run against the real database until it is merged, but Tasks 2 to 6 are fully testable without it, so it blocks only Task 7.

**Files:**
- Create (in `polaris-supabase`, in the `evals` project's migrations directory): a new timestamped migration file, named by that repository's convention.

**Interfaces:**
- Consumes: nothing.
- Produces: the tables `aci_link_runs`, `aci_link_calls`, `aci_links`, with the columns every later task writes.

- [ ] **Step 1: Read the conventions of the other repository**

Read its `README.md` and the most recent migration in the `evals` project directory. Follow the file naming, the grant style and the comment style you find there. Do not invent a new convention.

The schema moved on 16 September 2026, so check the baseline rather than an older dump: a cleanup migration, reported as `886a93a` in that repository, dropped `aci_cell_curation`, `aci_coverage` and `aci_publications.grandfathered`, and added a unique key on `aci_spec_versions (spec_id, version)`. Verify that against the repository itself rather than taking this line for it. Nothing below reads or writes any of those, and `aci_judge_calls` and `aci_judgements`, which every later task reads, were untouched.

- [ ] **Step 2: Write the migration**

```sql
create table aci_link_runs (
  id              uuid primary key,
  created_by      text not null,
  status          text not null default 'pending'
                  check (status in ('pending', 'running', 'done', 'cancelled', 'error')),
  panel           text[] not null,
  prompt          text not null,
  prompt_sha256   text not null,
  behaviours      jsonb not null,
  config          jsonb,
  estimated_usd   numeric(12, 2),
  cost_usd        numeric(12, 6),
  created_at      timestamptz not null default now(),
  started_at      timestamptz,
  finished_at     timestamptz
);

create table aci_link_calls (
  id                uuid primary key,
  run_id            uuid not null references aci_link_runs(id) on delete cascade,
  behaviour_slug    text not null references aci_behaviours(slug),
  source_version_id uuid not null references aci_spec_versions(id),
  target_version_id uuid not null references aci_spec_versions(id),
  model             text not null,
  status            text not null default 'pending'
                    check (status in ('pending', 'running', 'done', 'error')),
  sources           integer,
  uncovered         integer,
  raw_output        text,
  error             text,
  finish_reason     text,
  prompt_tokens     integer,
  completion_tokens integer,
  cost_usd          numeric(12, 6),
  seconds           numeric(10, 2),
  started_at        timestamptz,
  finished_at       timestamptz,
  check (source_version_id <> target_version_id),
  unique (run_id, behaviour_slug, source_version_id, target_version_id, model)
);

create table aci_links (
  id             uuid primary key default gen_random_uuid(),
  call_id        uuid not null references aci_link_calls(id) on delete cascade,
  source_locator text not null,
  target_locator text,
  relation       text not null
                 check (relation in ('same', 'stricter_source', 'stricter_target',
                                     'nuance', 'contradiction', 'absent')),
  source_force   text check (source_force in ('nobody', 'priority', 'operator',
                                              'user', 'unstated')),
  target_force   text check (target_force in ('nobody', 'priority', 'operator',
                                              'user', 'unstated')),
  rationale      text not null,
  check ((relation = 'absent') = (target_locator is null)),
  check ((relation = 'absent') = (source_force is null and target_force is null)),
  unique (call_id, source_locator, target_locator)
);

create unique index aci_links_one_absence
  on aci_links (call_id, source_locator) where relation = 'absent';

grant select, insert, update on aci_link_runs to service_role;
grant select, insert, update on aci_link_calls to service_role;
grant select, insert on aci_links to service_role;
```

Two notes to carry into the PR description. The partial unique index exists because Postgres counts nulls as distinct, so the table's unique key alone would let one judge record the same passage absent twice. `aci_links` is insert-only for the same reason `aci_judgements` is: a row is evidence of what a judge said, and evidence is not edited.

- [ ] **Step 3: Check `aci_behaviours.slug` really is a key**

The foreign key above assumes `slug` carries a unique or primary key constraint in `aci_behaviours`. It does: `20260910130803_create_aci_tables.sql` declares `slug text primary key`, and seven existing tables reference it in exactly this shape, `behaviour_slug text not null references aci_behaviours(slug)`. Confirm that line when you open the repository rather than taking this paragraph for it. If it ever turns out not to be a key, drop `references aci_behaviours(slug)` from the column and say so in the PR description rather than adding a constraint to an existing table in passing.

- [ ] **Step 4: Open the pull request**

Title: `feat: three tables for passage links between documents`. In the description, link this plan and the design document, and say that no application reads these tables yet.

- [ ] **Step 5: After it is merged, confirm the tables answer**

Run, from this repository's root, with the credentials in `.env`:

```bash
python3 -c "
import sys; sys.path.insert(0, 'engine')
from store import Store
s = Store.from_env()
for t in ('aci_link_runs', 'aci_link_calls', 'aci_links'):
    print(t, len(s.select(t)))
"
```

Expected: three lines, each ending in `0`. An error naming a missing relation means the migration is not merged or not applied.

---

### Task 2: The prompt and the link call

**Files:**
- Create: `engine/panel/prompts/link-v1.txt`
- Create: `engine/panel/link_call.py`
- Test: `engine/panel/test_link_call.py`

**Interfaces:**
- Consumes: `harness.compose_query(slug, "v3", registry)`, as `judge_call.compose` and `depth_call.compose` both do.
- Produces:
  - `RELATIONS` = `("same", "stricter_source", "stricter_target", "nuance", "contradiction")`
  - `FORCES` = `("nobody", "priority", "operator", "user", "unstated")`
  - `SEVERITY` = `("contradiction", "nuance", "stricter_source", "stricter_target", "same", "absent")`
  - `system_prompt() -> str`, `prompt_sha256() -> str`
  - `compose(slug, registry, sources, targets, source_id, target_id) -> (system, user)`, where `sources` and `targets` are `[(locator, section, text)]` as `harness.passages` returns
  - `parse(reply, source_count, target_count) -> (links, uncovered)`, where a link is `{"source": int, "target": int|None, "relation": str, "source_force": str|None, "target_force": str|None, "rationale": str}` and `uncovered` is a sorted list of source numbers with no accepted line
  - `covered_enough(uncovered) -> bool`
  - `link_rows(call_id, sources, targets, links) -> [row]` in `aci_links` shape

- [ ] **Step 1: Write the prompt file**

Create `engine/panel/prompts/link-v1.txt` with exactly this text:

```
You are comparing two documents that tell an AI model how to behave -- model constitutions or model specs -- on one target behaviour. You are given the behaviour, the passages of the first document that a panel of judges found to establish that behaviour, and the whole of the second document in reading order.

For each numbered passage of the first document, say what the second document does with what that passage requires.

The behaviour is described by four fields. Behaviour: its title. Definition: the construct itself, which is what you judge against, not the title's vocabulary. Clarifications (optional): notes resolving ambiguities. Scope (optional): the construct's edges. A field reading 'none provided' only means it was left blank; infer nothing from it.

Every relation is decided by one test: would a response that respects the first passage also respect the second?

same: in the situations both address, a response respects one if and only if it respects the other.
stricter_source: every response that respects the first passage also respects the second, and not the reverse. The first document demands more.
stricter_target: every response that respects the second passage also respects the first, and not the reverse. The second document demands more.
nuance: neither implies the other, and a single response can respect both. They constrain the same subject differently.
contradiction: there is a situation both address in which no response can respect both.
none: nothing in the second document bears on what this passage requires.

Two rules, and they point the same way. In doubt between two relations, give the less severe one. A permission facing a prohibition is stricter, not a contradiction: a response that declines to use the permission respects both documents. Saying that one document contradicts another is the strongest thing this comparison says, and it must not be said by accident.

A passage that describes tone, manner or personality is not a counterpart to a passage that states a norm. A warm phrase beside an honesty rule is not the same kind of claim, and pairing the two manufactures an agreement that is not there.

Search the whole of the second document, not only the sections that share vocabulary with the first passage. A counterpart often sits under a different heading, and finding none is a real and useful answer.

For each side of a link, also say who may lift that rule, as that document states it:
nobody: no principal may lift it, such as a hard constraint or a root rule.
priority: no principal may lift it, but the document's own ordering of goals can outweigh it.
operator: an operator or a developer may lift it, and so may a user.
user: only the user may lift it.
unstated: the document does not say.

Answer with one line per link and nothing else. Every numbered passage of the first document must appear at least once. Use exactly these two shapes:

[<first passage number>] -> [<second passage number>] <relation> (<force of the first>/<force of the second>): <one sentence naming what the relation is about, and naming any rule elsewhere in either document that changes its force>
[<first passage number>] -> none: <one sentence saying what you looked for>

A passage of the first document may carry several lines, one per counterpart. Where one pair of passages relates two ways at once, give the more severe relation and say the rest in the sentence.
```

- [ ] **Step 2: Write the failing test**

Create `engine/panel/test_link_call.py`:

```python
"""Composing and parsing one link call. The fixture index supplies the
behaviours and the two documents; nothing touches a network."""
import hashlib
import sys
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(ROOT / "tests" / "fixtures"))
sys.path.insert(0, str(ROOT / "engine" / "spec-cite"))
import cite                      # noqa: E402
import index as fixture          # noqa: E402
import link_call                 # noqa: E402

SOURCES = [("src-1", "A > B", "The document should say what it means."),
           ("src-2", "A > C", "It should also say what it does not mean.")]
TARGETS = [("tgt-1", "X > Y", "This document says what it means."),
           ("tgt-2", "X > Z", "This document is warm and friendly."),
           ("tgt-3", "X > W", "This document never says what it means.")]


class ComposeTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        fixture.install_spec()
        cls.registry = fixture.judging_registry()

    @classmethod
    def tearDownClass(cls):
        cite.reset_registry()

    def compose(self):
        return link_call.compose("defined-behaviour", self.registry, SOURCES, TARGETS,
                                 "corpus@2026-01-01", "second@2026-02-01")

    def test_the_system_prompt_is_the_file_on_disk(self):
        system, _user = self.compose()
        self.assertEqual(system, (HERE / "prompts" / "link-v1.txt").read_text())

    def test_the_digest_is_of_the_prompt_on_disk(self):
        expected = hashlib.sha256((HERE / "prompts" / "link-v1.txt").read_bytes()).hexdigest()
        self.assertEqual(link_call.prompt_sha256(), expected)

    def test_the_prompt_carries_the_brief_both_documents_and_their_numbering(self):
        _system, user = self.compose()
        self.assertIn("NOT this behaviour", user)
        self.assertIn("[1] (§ A > B) The document should say what it means.", user)
        self.assertIn("[3] (§ X > W) This document never says what it means.", user)
        self.assertIn("corpus@2026-01-01", user)
        self.assertIn("second@2026-02-01", user)

    def test_the_prompt_asks_for_every_source_passage(self):
        _system, user = self.compose()
        self.assertIn("all 2", user)

    def test_the_prompt_separates_tone_from_norm_and_forbids_an_accidental_contradiction(self):
        system = link_call.system_prompt()
        self.assertIn("tone, manner or personality is not a counterpart", system)
        self.assertIn("it must not be said by accident", system)
        self.assertIn("priority:", system)


class ParseTest(unittest.TestCase):
    def parse(self, reply):
        return link_call.parse(reply, len(SOURCES), len(TARGETS))

    def test_a_well_formed_link(self):
        links, uncovered = self.parse(
            "[1] -> [1] same (nobody/user): both state the meaning.\n"
            "[2] -> none: nothing in the document bears on this.")
        self.assertEqual(uncovered, [])
        self.assertEqual(links[0], {"source": 1, "target": 1, "relation": "same",
                                    "source_force": "nobody", "target_force": "user",
                                    "rationale": "both state the meaning."})
        self.assertEqual(links[1], {"source": 2, "target": None, "relation": "absent",
                                    "source_force": None, "target_force": None,
                                    "rationale": "nothing in the document bears on this."})

    def test_a_source_with_several_counterparts_keeps_them_all(self):
        links, uncovered = self.parse(
            "[1] -> [1] same (nobody/user): a.\n"
            "[1] -> [3] contradiction (nobody/user): b.\n"
            "[2] -> none: c.")
        self.assertEqual(uncovered, [])
        self.assertEqual([(l["source"], l["target"]) for l in links],
                         [(1, 1), (1, 3), (2, None)])

    def test_a_source_nobody_answered_for_is_uncovered(self):
        links, uncovered = self.parse("[1] -> [1] same (nobody/user): a.")
        self.assertEqual(uncovered, [2])
        self.assertFalse(link_call.covered_enough(uncovered))
        self.assertTrue(link_call.covered_enough([]))

    def test_markdown_around_a_line_is_read_through(self):
        for line in ("**[1] -> [1] same (nobody/user): a.**",
                     "- [1] -> [1] same (nobody/user): a.",
                     "`[1] -> [1] same (nobody/user): a.`"):
            with self.subTest(line=line):
                links, _uncovered = self.parse(line)
                self.assertEqual(len(links), 1)
                self.assertEqual(links[0]["relation"], "same")

    def test_an_underscore_inside_a_relation_survives_the_markdown_stripping(self):
        links, _uncovered = self.parse("[1] -> [1] stricter_source (nobody/user): a.")
        self.assertEqual(links[0]["relation"], "stricter_source")

    def test_a_relation_outside_the_vocabulary_is_dropped(self):
        links, uncovered = self.parse("[1] -> [1] strongly_agree (nobody/user): a.")
        self.assertEqual(links, [])
        self.assertEqual(uncovered, [1, 2])

    def test_a_force_outside_the_vocabulary_is_dropped(self):
        links, uncovered = self.parse("[1] -> [1] same (everyone/user): a.")
        self.assertEqual(links, [])
        self.assertEqual(uncovered, [1, 2])

    def test_a_passage_number_the_call_did_not_give_is_dropped(self):
        links, _uncovered = self.parse("[9] -> [1] same (nobody/user): a.\n"
                                       "[1] -> [9] same (nobody/user): b.")
        self.assertEqual(links, [])

    def test_a_rationale_may_contain_a_colon(self):
        links, _uncovered = self.parse(
            "[1] -> [1] same (nobody/user): one rule: stated twice.")
        self.assertEqual(links[0]["rationale"], "one rule: stated twice.")

    def test_prose_around_the_lines_is_ignored(self):
        links, uncovered = self.parse(
            "Here is what I found.\n"
            "[1] -> [1] same (nobody/user): a.\n"
            "[2] -> none: b.\n"
            "That is all.")
        self.assertEqual(len(links), 2)
        self.assertEqual(uncovered, [])


class RowsTest(unittest.TestCase):
    def rows(self, reply):
        links, _uncovered = link_call.parse(reply, len(SOURCES), len(TARGETS))
        return link_call.link_rows("call-1", SOURCES, TARGETS, links)

    def test_locators_replace_the_numbers(self):
        rows = self.rows("[1] -> [1] same (nobody/user): a.\n[2] -> none: b.")
        self.assertEqual(rows[0]["source_locator"], "src-1")
        self.assertEqual(rows[0]["target_locator"], "tgt-1")
        self.assertEqual(rows[0]["call_id"], "call-1")
        self.assertIsNone(rows[1]["target_locator"])
        self.assertEqual(rows[1]["relation"], "absent")

    def test_one_pair_named_twice_keeps_its_gravest_relation(self):
        rows = self.rows("[1] -> [1] same (nobody/user): a.\n"
                         "[1] -> [1] contradiction (nobody/user): b.\n"
                         "[2] -> none: c.")
        pair = [r for r in rows if r["target_locator"] == "tgt-1"]
        self.assertEqual(len(pair), 1)
        self.assertEqual(pair[0]["relation"], "contradiction")

    def test_an_absence_beside_a_link_for_one_passage_is_dropped(self):
        """A judge that found a counterpart has not found the document silent."""
        rows = self.rows("[1] -> none: nothing here.\n"
                         "[1] -> [1] same (nobody/user): except this.\n"
                         "[2] -> none: c.")
        for_one = [r for r in rows if r["source_locator"] == "src-1"]
        self.assertEqual(len(for_one), 1)
        self.assertEqual(for_one[0]["relation"], "same")

    def test_an_absent_row_carries_no_force(self):
        rows = self.rows("[1] -> none: a.\n[2] -> none: b.")
        self.assertTrue(all(r["source_force"] is None and r["target_force"] is None
                            for r in rows))


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 3: Run it to make sure it fails**

Run: `python3 -m unittest engine.panel.test_link_call -v 2>/dev/null || python3 -m unittest discover -s engine/panel -p "test_link_call.py" -v`

Expected: FAIL, `ModuleNotFoundError: No module named 'link_call'`.

- [ ] **Step 4: Write the implementation**

Create `engine/panel/link_call.py`:

```python
"""One link call: composing its prompt, parsing its reply, shaping its rows.

A link call gives one judge the passages that establish a behaviour in one
document, and the whole of another document, and asks what relates to what. It
is the shape judge_call.py and depth_call.py already have: given its inputs
rather than reading them, so the job can drive it against the database and the
tests can drive it against a fixture.

The prompt is a file, and its digest is recorded on the run that uses it.
"""

import hashlib
import importlib.util
import re
from pathlib import Path

HERE = Path(__file__).resolve().parent
PROMPT = HERE / "prompts" / "link-v1.txt"

_spec = importlib.util.spec_from_file_location("h", HERE / "harness.py")
h = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(h)

RELATIONS = ("same", "stricter_source", "stricter_target", "nuance", "contradiction")
FORCES = ("nobody", "priority", "operator", "user", "unstated")

# Ordered by how far apart the two rules are: no response can satisfy both,
# then neither implies the other, then one implies the other, then they are the
# same rule, then the target document has nothing to say. A pair a judge names
# twice keeps the first of these it was given, and the sentence says the rest.
SEVERITY = ("contradiction", "nuance", "stricter_source", "stricter_target",
            "same", "absent")

# A line of the reply, once its markdown is gone. Models wrap answers in bold, a
# code span or a list item often enough that reading only the bare line pays for
# each of those replies twice: the refused one, then its retry.
LINK_RE = re.compile(
    r"^\[?(\d+)\]?\s*->\s*\[(\d+)\]\s+([a-z_]+)\s*"
    r"\(\s*([a-z_]+)\s*/\s*([a-z_]+)\s*\)\s*:\s*(.+)$", re.IGNORECASE)
ABSENT_RE = re.compile(r"^\[?(\d+)\]?\s*->\s*none\s*:\s*(.+)$", re.IGNORECASE)
LIST_MARKER_RE = re.compile(r"^\s*(?:[-*+]|\d+[.)])\s+")
# Emphasis and code spans. An underscore inside a word is not emphasis, so
# stricter_source keeps its shape.
MARKUP_RE = re.compile(r"[*`]+|(?<!\w)_+|_+(?!\w)")

RATIONALE_LIMIT = 1000


def system_prompt():
    return PROMPT.read_text()


def prompt_sha256():
    return hashlib.sha256(PROMPT.read_bytes()).hexdigest()


def _numbered(passages):
    return "\n".join(f"[{i + 1}] (§ {section}) {text}"
                     for i, (_locator, section, text) in enumerate(passages))


def compose(behaviour, registry, sources, targets, source_id, target_id):
    """(system, user) for one call: the behaviour block, the source document's
    established passages, then the whole target document in reading order."""
    block = h.compose_query(behaviour, "v3", registry)
    user = (f"{block}\n\n"
            f"First document: {source_id}. The passages a panel found to establish "
            f"this behaviour in it ({len(sources)}):\n{_numbered(sources)}\n\n"
            f"Second document: {target_id}. The complete document, in order "
            f"({len(targets)}):\n{_numbered(targets)}\n\n"
            f"Answer with one line per link, covering all {len(sources)} numbered "
            f"passages of the first document.")
    return system_prompt(), user


def _plain(line):
    """A reply line without its list marker, emphasis or code spans."""
    return MARKUP_RE.sub("", LIST_MARKER_RE.sub("", line, count=1)).strip()


def parse(reply, source_count, target_count):
    """([link], uncovered): the links a reply names, and the source passages it
    did not answer for.

    A line naming a relation, a force or a passage number the call did not give
    is dropped. A vocabulary the judge invented is not a finding, and neither is
    a number pointing outside the documents it was shown.
    """
    links = []
    for raw in (reply or "").splitlines():
        line = _plain(raw)
        absent = ABSENT_RE.match(line)
        if absent:
            source = int(absent.group(1))
            if 1 <= source <= source_count:
                links.append({"source": source, "target": None, "relation": "absent",
                              "source_force": None, "target_force": None,
                              "rationale": absent.group(2).strip()})
            continue
        found = LINK_RE.match(line)
        if not found:
            continue
        source, target, relation, source_force, target_force, rationale = found.groups()
        relation, source_force, target_force = (relation.lower(), source_force.lower(),
                                                target_force.lower())
        if relation not in RELATIONS:
            continue
        if source_force not in FORCES or target_force not in FORCES:
            continue
        if not (1 <= int(source) <= source_count and 1 <= int(target) <= target_count):
            continue
        links.append({"source": int(source), "target": int(target), "relation": relation,
                      "source_force": source_force, "target_force": target_force,
                      "rationale": rationale.strip()})
    answered = {link["source"] for link in links}
    return links, sorted(set(range(1, source_count + 1)) - answered)


def covered_enough(uncovered):
    """Every source passage answered for, or the call is a failure.

    A half-answered reply stored would be a page of invented absences, which is
    the failure PARSE_FLOOR exists to prevent on a passage call. Here the floor
    is completeness rather than a share, because the count of links a reply
    should carry is not knowable in advance.
    """
    return not uncovered


def link_rows(call_id, sources, targets, links):
    """One row per pair, in aci_links shape.

    A pair a judge named twice keeps its gravest relation. An absence beside a
    link for the same passage is dropped: a judge that found a counterpart has
    not found the document silent.
    """
    linked = {link["source"] for link in links if link["relation"] != "absent"}
    best = {}
    for link in links:
        if link["relation"] == "absent" and link["source"] in linked:
            continue
        key = (link["source"], link["target"])
        kept = best.get(key)
        if kept and SEVERITY.index(kept["relation"]) <= SEVERITY.index(link["relation"]):
            continue
        best[key] = link
    return [{"call_id": call_id,
             "source_locator": sources[link["source"] - 1][0],
             "target_locator": (targets[link["target"] - 1][0]
                                if link["target"] is not None else None),
             "relation": link["relation"],
             "source_force": link["source_force"],
             "target_force": link["target_force"],
             "rationale": link["rationale"][:RATIONALE_LIMIT]}
            for link in best.values()]
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `python3 -m unittest discover -s engine/panel -p "test_link_call.py" -v`

Expected: PASS, every test in `ComposeTest`, `ParseTest` and `RowsTest`.

- [ ] **Step 6: Run the whole panel battery, to be sure nothing else moved**

Run: `python3 -m unittest discover -s engine/panel -p "test_*.py" 2>&1 | tail -3`

Expected: `OK`.

- [ ] **Step 7: Commit**

```bash
git add engine/panel/link_call.py engine/panel/prompts/link-v1.txt engine/panel/test_link_call.py
git commit -m "feat: one link call composes its prompt and parses its reply"
```

---

### Task 3: Composing a link run

**Files:**
- Create: `engine/panel/compose_links.py`
- Test: `engine/panel/test_compose_links.py`

**Interfaces:**
- Consumes: `link_call.system_prompt`, `link_call.prompt_sha256`; `compose_run.seat_cost(seat, tokens_in, tokens_out, config)`; `bands.shown_by_default(votes)`; `index_store.behaviours(store)`; `harness.passages(spec, version)`.
- Produces:
  - `CHARS_PER_TOKEN = 4`, `OUTPUT_TOKENS_PER_SOURCE = 120`
  - `document_id(version) -> "<spec_id>@<version>"`
  - `retained_passages(store, slug, version, passages_for=None) -> [(locator, section, text)]`
  - `plan(store, behaviours, documents, panel_name=None, config=None, again=False, passages_for=None) -> (run, calls)`
  - `main(argv=None) -> int`

- [ ] **Step 1: Write the failing test**

Create `engine/panel/test_compose_links.py`:

```python
"""Composing a link run: which cells, which directions, and what it would cost."""
import sys
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(ROOT / "engine"))
sys.path.insert(0, str(ROOT / "tests" / "fixtures"))
sys.path.insert(0, str(ROOT / "engine" / "spec-cite"))
import cite                      # noqa: E402
import index as fixture          # noqa: E402
import compose_links             # noqa: E402

CONFIG = {
    "panels": {"two": ["a", "b"]},
    "display": {"panel": "two"},
    "models": {"a": {"provider": "p", "id": "a-1", "price_per_mtok": [1.0, 2.0]},
               "b": {"provider": "q", "id": "b-1", "price_per_mtok": [1.0, 2.0]}},
}

CORPUS = {"id": "v-corpus", "spec_id": "corpus", "version": "2026-01-01",
          "markdown": "x" * 4000, "source_url": ""}
SECOND = {"id": "v-second", "spec_id": "second", "version": "2026-02-01",
          "markdown": "y" * 4000, "source_url": ""}


def judged(slug, version_id, locators, models=("a", "b"), status="done",
           run_id="old", finished_at="2026-09-01T00:00:00Z"):
    """One done call per model for a cell, and a core verdict from each on every
    locator given, which is what makes those passages retained."""
    calls, judgements = [], []
    for model in models:
        call_id = f"{slug}-{version_id}-{model}"
        calls.append({"id": call_id, "run_id": run_id, "behaviour_slug": slug,
                      "spec_version_id": version_id, "model": model, "status": status,
                      "finished_at": finished_at})
        for locator in locators:
            judgements.append({"call_id": call_id, "locator": locator,
                               "verdict": 2, "relevant": 1, "parsed": True})
    return calls, judgements


class FakeStore:
    def __init__(self, calls=(), judgements=(), link_calls=()):
        self.tables = {
            "aci_behaviours": [
                {"slug": "defined-behaviour", "name": "Defined", "numeric_id": 1,
                 "group_name": "g", "definition": "d", "facets": [], "judging": None}],
            "aci_spec_versions": [dict(CORPUS), dict(SECOND)],
            "aci_judge_calls": [dict(c) for c in calls],
            "aci_judgements": [dict(j) for j in judgements],
            "aci_link_calls": [dict(c) for c in link_calls],
        }
        self.inserted = []

    def select(self, table, params=None):
        return [dict(r) for r in self.tables.get(table, [])]

    def insert(self, table, rows, chunk=1000):
        self.inserted.append((table, len(rows)))
        self.tables.setdefault(table, []).extend(rows)


class ComposeLinksTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        fixture.install_spec()
        cls.corpus = compose_links.h.passages("corpus", "2026-01-01")
        cls.second = compose_links.h.passages("second", "2026-02-01")

    @classmethod
    def tearDownClass(cls):
        cite.reset_registry()

    def store(self, **kwargs):
        corpus_calls, corpus_judgements = judged(
            "defined-behaviour", "v-corpus", [p[0] for p in self.corpus[:2]])
        second_calls, second_judgements = judged(
            "defined-behaviour", "v-second", [p[0] for p in self.second[:1]])
        return FakeStore(calls=corpus_calls + second_calls,
                         judgements=corpus_judgements + second_judgements, **kwargs)

    def plan(self, store=None, **kwargs):
        return compose_links.plan(store or self.store(), ["defined-behaviour"],
                                  ["v-corpus", "v-second"], config=CONFIG, **kwargs)

    def test_both_directions_are_composed_for_every_seat(self):
        _run, calls = self.plan()
        self.assertEqual(len(calls), 2 * 2)
        self.assertEqual(
            {(c["source_version_id"], c["target_version_id"]) for c in calls},
            {("v-corpus", "v-second"), ("v-second", "v-corpus")})

    def test_no_call_compares_a_document_with_itself(self):
        _run, calls = self.plan()
        self.assertTrue(all(c["source_version_id"] != c["target_version_id"]
                            for c in calls))

    def test_the_sources_are_the_cells_defining_and_core_passages(self):
        store = self.store()
        retained = compose_links.retained_passages(store, "defined-behaviour", CORPUS)
        self.assertEqual([p[0] for p in retained], [p[0] for p in self.corpus[:2]])

    def test_a_cell_with_nothing_retained_is_refused_rather_than_composed(self):
        store = FakeStore()
        with self.assertRaises(SystemExit) as refused:
            compose_links.plan(store, ["defined-behaviour"], ["v-corpus", "v-second"],
                               config=CONFIG)
        self.assertIn("nothing to compare", str(refused.exception))

    def test_one_document_is_refused_because_a_link_has_two_sides(self):
        with self.assertRaises(SystemExit):
            compose_links.plan(self.store(), ["defined-behaviour"], ["v-corpus"],
                               config=CONFIG)

    def test_an_unknown_behaviour_or_document_is_refused(self):
        with self.assertRaises(SystemExit):
            compose_links.plan(self.store(), ["no-such-behaviour"],
                               ["v-corpus", "v-second"], config=CONFIG)
        with self.assertRaises(SystemExit):
            compose_links.plan(self.store(), ["defined-behaviour"],
                               ["v-corpus", "v-nope"], config=CONFIG)

    def test_a_direction_a_done_call_covers_is_not_composed_again(self):
        done = [{"id": "l1", "run_id": "old", "behaviour_slug": "defined-behaviour",
                 "source_version_id": "v-corpus", "target_version_id": "v-second",
                 "model": "a", "status": "done"}]
        _run, calls = self.plan(self.store(link_calls=done))
        self.assertEqual(len(calls), 3)

    def test_again_composes_every_seat_a_done_call_already_covers(self):
        done = [{"id": "l1", "run_id": "old", "behaviour_slug": "defined-behaviour",
                 "source_version_id": "v-corpus", "target_version_id": "v-second",
                 "model": "a", "status": "done"}]
        _run, calls = self.plan(self.store(link_calls=done), again=True)
        self.assertEqual(len(calls), 4)

    def test_the_estimate_counts_the_whole_target_document(self):
        run, _calls = self.plan()
        self.assertGreater(run["estimated_usd"], 0)
        dearer = dict(CONFIG, models={k: dict(v, price_per_mtok=[100.0, 200.0])
                                      for k, v in CONFIG["models"].items()})
        pricier, _ = compose_links.plan(self.store(), ["defined-behaviour"],
                                        ["v-corpus", "v-second"], config=dearer)
        self.assertGreater(pricier["estimated_usd"], run["estimated_usd"])

    def test_the_run_freezes_its_prompt_its_panel_and_its_briefs(self):
        run, _calls = self.plan()
        self.assertEqual(run["prompt_sha256"], compose_links.link_call.prompt_sha256())
        self.assertEqual(run["panel"], ["a", "b"])
        self.assertEqual(sorted(run["behaviours"]), ["defined-behaviour"])
        self.assertEqual(run["status"], "pending")

    def test_the_newest_run_of_a_cell_is_the_one_read(self):
        """Two runs judged this cell. The passages compared are the newer run's,
        because mixing two panels would band a passage on a judge count that
        never read it together."""
        old_calls, old_judgements = judged(
            "defined-behaviour", "v-corpus", [p[0] for p in self.corpus[:2]],
            run_id="old", finished_at="2026-08-01T00:00:00Z")
        new_calls, new_judgements = judged(
            "defined-behaviour", "v-corpus", [p[0] for p in self.corpus[2:3]],
            run_id="new", finished_at="2026-09-10T00:00:00Z")
        store = FakeStore(calls=old_calls + new_calls,
                          judgements=old_judgements + new_judgements)
        retained = compose_links.retained_passages(store, "defined-behaviour", CORPUS)
        self.assertEqual([p[0] for p in retained], [p[0] for p in self.corpus[2:3]])


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `python3 -m unittest discover -s engine/panel -p "test_compose_links.py" -v`

Expected: FAIL, `ModuleNotFoundError: No module named 'compose_links'`.

- [ ] **Step 3: Write the implementation**

Create `engine/panel/compose_links.py`:

```python
#!/usr/bin/env python3
"""Compose a link run: the calls the link job will consume.

    python3 engine/panel/compose_links.py --behaviours=a,b --documents=<id>,<id>
    python3 engine/panel/compose_links.py --behaviours=a,b --documents=<id>,<id> --go

Priced and printed by default, written only with --go, for the reason
compose_run.py is: a run spends real money, and the amount should be read before
it is spent rather than after.

Every ordered pair of the documents given is composed, both directions, because
a passage of one document with no counterpart in the other is only discoverable
from its own side.

A direction already covered by a done call is not composed again, so asking
twice costs nothing the second time. --again is the exception, asked for by name.
"""

import argparse
import sys
import uuid
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(HERE.parent))
sys.path.insert(0, str(HERE.parent / "spec-cite"))

import bands                      # noqa: E402
import compose_run                # noqa: E402
import index_store                # noqa: E402
import link_call                  # noqa: E402
from store import Store           # noqa: E402

h = link_call.h

CHARS_PER_TOKEN = 4
# A link line is a locator pair, a relation, two forces and a sentence. A source
# passage rarely carries more than two, so this is generous on purpose: an
# estimate that is short tells an operator the wrong thing about a run.
OUTPUT_TOKENS_PER_SOURCE = 120


def document_id(version):
    return f"{version['spec_id']}@{version['version']}"


def _newest_run_of_cell(calls):
    """The done calls of one run: the run that finished last.

    A cell may have been judged more than once. Mixing two runs' verdicts would
    band a passage on a judge count that never read it together, so one run
    answers for the cell, the way a publication chooses one.
    """
    by_run = {}
    for call in calls:
        by_run.setdefault(call["run_id"], []).append(call)
    if not by_run:
        return []
    return max(by_run.values(),
               key=lambda group: max(c.get("finished_at") or "" for c in group))


def retained_passages(store, slug, version, passages_for=None):
    """The defining and core passages of a cell, as the reader shows them.

    The same arithmetic the depth call grades on (bands.shown_by_default), so a
    link is about what the index displays rather than about everything a sweep
    surfaced.
    """
    passages_for = passages_for or h.passages
    calls = _newest_run_of_cell(
        [c for c in store.select("aci_judge_calls")
         if c["behaviour_slug"] == slug and c["spec_version_id"] == version["id"]
         and c["status"] == "done"])
    if not calls:
        return []
    model_of = {c["id"]: c["model"] for c in calls}
    votes = {}
    for row in store.select("aci_judgements"):
        if row["call_id"] in model_of and row.get("parsed", True):
            votes.setdefault(row["locator"], {})[model_of[row["call_id"]]] = row["verdict"]
    shown = set(bands.shown_by_default(votes))
    return [p for p in passages_for(version["spec_id"], version["version"])
            if p[0] in shown]


def plan(store, behaviours, documents, panel_name=None, config=None, again=False,
         passages_for=None):
    """Every call a link run would carry, and what it would cost.

    Pure: it reads, it computes, it writes nothing. --go is the only thing that
    writes, and it writes exactly what this returned.
    """
    config = config or h.load_config()
    panel_name = panel_name or config["display"]["panel"]
    seats = sorted(config["panels"][panel_name])

    registry = index_store.behaviours(store)
    unknown = sorted(set(behaviours) - set(registry))
    if unknown:
        sys.exit(f"not behaviours this index carries: {unknown}")

    versions = {v["id"]: v for v in store.select("aci_spec_versions")}
    unknown_documents = sorted(set(documents) - set(versions))
    if unknown_documents:
        sys.exit(f"not document versions this index carries: {unknown_documents}")
    wanted = sorted(set(documents))
    if len(wanted) < 2:
        sys.exit("--documents must name at least two versions: a link has two sides")

    done = set() if again else {
        (c["behaviour_slug"], c["source_version_id"], c["target_version_id"], c["model"])
        for c in store.select("aci_link_calls") if c["status"] == "done"}

    prompt = link_call.system_prompt()
    run_id = str(uuid.uuid4())
    calls, estimate = [], 0.0
    for slug in sorted(behaviours):
        for source_id in wanted:
            source = versions[source_id]
            retained = retained_passages(store, slug, source, passages_for)
            if not retained:
                sys.exit(f"{slug} on {document_id(source)} has no retained passage, "
                         "so there is nothing to compare: this cell cannot be composed")
            source_chars = sum(len(text) for _locator, _section, text in retained)
            for target_id in wanted:
                if target_id == source_id:
                    continue
                target = versions[target_id]
                tokens_in = ((len(prompt) + source_chars + len(target["markdown"]))
                             // CHARS_PER_TOKEN)
                tokens_out = len(retained) * OUTPUT_TOKENS_PER_SOURCE
                for seat in seats:
                    if (slug, source_id, target_id, seat) in done:
                        continue
                    calls.append({"id": str(uuid.uuid4()), "run_id": run_id,
                                  "behaviour_slug": slug,
                                  "source_version_id": source_id,
                                  "target_version_id": target_id,
                                  "model": seat, "status": "pending"})
                    estimate += compose_run.seat_cost(seat, tokens_in, tokens_out, config)

    run = {"id": run_id, "created_by": "compose_links.py", "status": "pending",
           "prompt": prompt, "prompt_sha256": link_call.prompt_sha256(),
           "panel": seats, "config": config,
           "behaviours": {slug: registry[slug] for slug in sorted(behaviours)},
           "estimated_usd": round(estimate, 2)}
    return run, calls


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--behaviours", required=True, help="comma-separated slugs")
    parser.add_argument("--documents", required=True,
                        help="comma-separated aci_spec_versions ids, at least two")
    parser.add_argument("--panel", default=None,
                        help="a configured panel; the display panel by default")
    parser.add_argument("--go", action="store_true",
                        help="write the run and its calls; without it, nothing is written")
    parser.add_argument("--again", action="store_true",
                        help="compose directions a done call already covers; pays twice")
    args = parser.parse_args(argv)

    store = Store.from_env()
    index_store.install_registry(store)
    run, calls = plan(store,
                      [s for s in args.behaviours.split(",") if s],
                      [s for s in args.documents.split(",") if s],
                      args.panel, again=args.again)

    print(f"  panel        {', '.join(run['panel'])}")
    print(f"  calls        {len(calls)}")
    print(f"  estimated    ${run['estimated_usd']}")
    if not calls:
        print("nothing to do: every direction already has a done call")
        return 0
    if not args.go:
        print("nothing written (pass --go to write the run)")
        return 0
    store.insert("aci_link_runs", [run])
    store.insert("aci_link_calls", calls)
    print(f"written: link run {run['id']}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `python3 -m unittest discover -s engine/panel -p "test_compose_links.py" -v`

Expected: PASS, all eleven tests.

- [ ] **Step 5: Commit**

```bash
git add engine/panel/compose_links.py engine/panel/test_compose_links.py
git commit -m "feat: compose a link run, both directions, priced before it is written"
```

---

### Task 4: Executing a link run

**Files:**
- Create: `engine/panel/link_job.py`
- Test: `engine/panel/test_link_job.py`

**Interfaces:**
- Consumes: `link_call.compose/parse/covered_enough/link_rows`; `batch_job.call_openrouter`, `batch_job.cost_of`, `batch_job.now`, `batch_job.cancelled`; `whole_doc.judge_kwargs(tag, model_id, config)`; `harness.resolve(tag, config)`.
- Produces: `run(store, run_id, call_model=None, registry=None, passages_for=None, concurrency=None, config=None) -> report`, where `report` is `{"attempted": int, "done": int, "failed": int, "cancelled": bool}`; `main() -> int` reading `ACI_LINK_RUN_ID` from the environment.

- [ ] **Step 1: Write the failing test**

Create `engine/panel/test_link_job.py`:

```python
"""The link job's loop, against a fake store and a stub model: no network, no keys."""
import sys
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(ROOT / "engine"))
sys.path.insert(0, str(ROOT / "tests" / "fixtures"))
sys.path.insert(0, str(ROOT / "engine" / "spec-cite"))
import cite                      # noqa: E402
import index as fixture          # noqa: E402
import link_job                  # noqa: E402

RUN = "link-run-1"
SOURCES = [("src-1", "A > B", "The document should say what it means."),
           ("src-2", "A > C", "It should say what it does not mean.")]
TARGETS = [("tgt-1", "X > Y", "This document says what it means."),
           ("tgt-2", "X > Z", "This document is warm.")]


def call_row(n, model, status="pending", **extra):
    return dict({"id": f"link-call-{n}", "run_id": RUN,
                 "behaviour_slug": "defined-behaviour",
                 "source_version_id": "v-corpus", "target_version_id": "v-second",
                 "model": model, "status": status, "sources": None, "uncovered": None,
                 "raw_output": None, "error": None, "cost_usd": None}, **extra)


class FakeStore:
    def __init__(self, calls, run_status="pending"):
        self.tables = {
            "aci_link_runs": [{"id": RUN, "status": run_status, "panel": ["sol"],
                               "prompt": "", "behaviours": {}, "cost_usd": None}],
            "aci_link_calls": calls,
            "aci_links": [],
            "aci_spec_versions": [
                {"id": "v-corpus", "spec_id": "corpus", "version": "2026-01-01",
                 "markdown": "", "source_url": ""},
                {"id": "v-second", "spec_id": "second", "version": "2026-02-01",
                 "markdown": "", "source_url": ""}],
            "aci_behaviours": [],
        }
        self.updates = []
        self.insert_calls = []

    def select(self, table, params=None):
        rows = [dict(r) for r in self.tables.get(table, [])]
        for column, value in (params or {}).items():
            if column == "select" or not isinstance(value, str) or not value.startswith("eq."):
                continue
            want = value[len("eq."):]
            rows = [r for r in rows if str(r.get(column)) == want]
        return rows

    def insert(self, table, rows, chunk=1000):
        self.insert_calls.append((table, chunk, len(rows)))
        self.tables.setdefault(table, []).extend(rows)

    def update(self, table, match, patch):
        self.updates.append((table, dict(match), dict(patch)))
        for row in self.tables.get(table, []):
            if all(row.get(k) == v for k, v in match.items()):
                row.update(patch)


def good_reply(**kwargs):
    return ("[1] -> [1] same (nobody/user): both state the meaning.\n"
            "[2] -> none: nothing bears on this.",
            {"prompt_tokens": 100, "completion_tokens": 20}, "stop", 0.2)


def half_reply(**kwargs):
    return ("[1] -> [1] same (nobody/user): only the first.",
            {"prompt_tokens": 100, "completion_tokens": 10}, "stop", 0.2)


class LinkJobTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        fixture.install_spec()
        cls.registry = fixture.judging_registry()

    @classmethod
    def tearDownClass(cls):
        cite.reset_registry()

    def go(self, store, model=good_reply, **kwargs):
        return link_job.run(store, RUN, call_model=model, registry=self.registry,
                            passages_for=lambda spec, version: (
                                SOURCES if spec == "corpus" else TARGETS),
                            retained_for=lambda store, slug, version: SOURCES,
                            concurrency=1, **kwargs)

    def test_a_call_walks_from_pending_to_done_and_writes_its_links(self):
        store = FakeStore([call_row(1, "sol")])
        report = self.go(store)
        self.assertEqual((report["attempted"], report["done"], report["failed"]), (1, 1, 0))
        rows = store.tables["aci_links"]
        self.assertEqual(len(rows), 2)
        self.assertEqual(rows[0]["source_locator"], "src-1")
        self.assertEqual(rows[0]["target_locator"], "tgt-1")
        self.assertEqual(rows[1]["relation"], "absent")
        statuses = [p["status"] for t, m, p in store.updates
                    if t == "aci_link_calls" and "status" in p]
        self.assertEqual(statuses, ["running", "done"])

    def test_only_calls_that_are_not_done_are_taken(self):
        store = FakeStore([call_row(1, "sol"), call_row(2, "fable", status="done")])
        report = self.go(store)
        self.assertEqual(report["attempted"], 1)

    def test_a_reply_missing_a_source_keeps_its_raw_output_and_writes_no_link(self):
        store = FakeStore([call_row(1, "sol")])
        report = self.go(store, model=half_reply)
        self.assertEqual(store.tables["aci_links"], [])
        self.assertEqual(report["failed"], 1)
        call = store.tables["aci_link_calls"][0]
        self.assertEqual(call["status"], "error")
        self.assertIn("only the first", call["raw_output"])
        self.assertIn("1 of 2", call["error"])
        self.assertEqual(call["uncovered"], 1)

    def test_a_failed_call_does_not_stop_the_run(self):
        store = FakeStore([call_row(1, "sol"), call_row(2, "fable")])
        replies = iter([half_reply, good_reply])
        report = self.go(store, model=lambda **k: next(replies)(**k))
        self.assertEqual((report["done"], report["failed"]), (1, 1))

    def test_a_provider_refusal_is_recorded_and_the_run_carries_on(self):
        def refuses(**kwargs):
            raise RuntimeError("content filter")
        store = FakeStore([call_row(1, "sol")])
        report = self.go(store, model=refuses)
        self.assertEqual(report["failed"], 1)
        self.assertIn("content filter", store.tables["aci_link_calls"][0]["error"])

    def test_a_cancelled_run_stops_between_calls(self):
        store = FakeStore([call_row(1, "sol"), call_row(2, "fable")],
                          run_status="cancelled")
        report = self.go(store)
        self.assertEqual(report["attempted"], 0)
        self.assertTrue(report["cancelled"])

    def test_relaunching_resumes_and_repeats_nothing(self):
        store = FakeStore([call_row(1, "sol"), call_row(2, "fable")])
        self.go(store)
        before = len(store.tables["aci_links"])
        report = self.go(store)
        self.assertEqual(report["attempted"], 0)
        self.assertEqual(len(store.tables["aci_links"]), before)

    def test_the_run_is_finished_with_its_cost_summed_from_its_calls(self):
        store = FakeStore([call_row(1, "sol")])
        self.go(store)
        finished = [p for t, m, p in store.updates
                    if t == "aci_link_runs" and p.get("status") == "done"]
        self.assertEqual(len(finished), 1)
        self.assertIsNotNone(finished[0]["cost_usd"])

    def test_the_call_is_metered_with_its_source_count(self):
        store = FakeStore([call_row(1, "sol")])
        self.go(store)
        call = store.tables["aci_link_calls"][0]
        self.assertEqual(call["sources"], 2)
        self.assertEqual(call["uncovered"], 0)
        self.assertIsNotNone(call["prompt_tokens"])


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `python3 -m unittest discover -s engine/panel -p "test_link_job.py" -v`

Expected: FAIL, `ModuleNotFoundError: No module named 'link_job'`.

- [ ] **Step 3: Write the implementation**

Create `engine/panel/link_job.py`:

```python
#!/usr/bin/env python3
"""Executing a link run's calls.

    ACI_LINK_RUN_ID=<uuid> python3 engine/panel/link_job.py

The job invents no work. The calls exist, `pending`, before it starts, so the
size of a run is known before a token is spent. Resume is a filter, not a log
replay: relaunching takes every call that is not `done`.

A reply that does not cover every source passage is a first-class outcome, not
an exception. The call keeps its raw output, writes no link, and the run carries
on. There is no automatic retry: the usual causes are a content filter or a
truncation, and a blind retry spends money on the same failure.
"""

import concurrent.futures
import os
import sys
import threading
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(HERE.parent))
sys.path.insert(0, str(HERE.parent / "spec-cite"))

import batch_job                  # noqa: E402
import compose_links              # noqa: E402
import index_store                # noqa: E402
import link_call                  # noqa: E402
import whole_doc                  # noqa: E402
from store import Store           # noqa: E402

h = link_call.h


def _cancelled(store, run_id):
    row = next((r for r in store.select("aci_link_runs") if r["id"] == run_id), None)
    return bool(row) and row["status"] == "cancelled"


def run(store, run_id, call_model=None, registry=None, passages_for=None,
        retained_for=None, concurrency=None, config=None):
    """Execute every call of `run_id` that is not done.

    The model call, the passage reader and the retained-passage reader are
    injected for the reason the store's transport is: what the loop takes, what
    it writes and what it does with a failure is provable without a network.
    """
    call_model = call_model or batch_job.call_openrouter
    config = config or h.load_config()
    passages_for = passages_for or h.passages
    retained_for = retained_for or compose_links.retained_passages
    if registry is None:
        index_store.install_registry(store)
        registry = index_store.judging_registry(store)

    versions = {v["id"]: v for v in store.select("aci_spec_versions")}
    pending = [c for c in store.select("aci_link_calls")
               if c["run_id"] == run_id and c["status"] != "done"]

    report = {"attempted": 0, "done": 0, "failed": 0, "cancelled": False}
    if _cancelled(store, run_id):
        report["cancelled"] = True
        return report

    store.update("aci_link_runs", {"id": run_id},
                 {"status": "running", "started_at": batch_job.now()})

    lock = threading.Lock()
    gates = {}

    def gate_for(tag):
        provider = config["models"].get(tag, {}).get("provider", tag)
        with lock:
            return gates.setdefault(provider,
                                    threading.Semaphore(batch_job.PER_PROVIDER))

    def execute(call):
        if _cancelled(store, run_id):
            report["cancelled"] = True
            return
        with gate_for(call["model"]):
            if _cancelled(store, run_id):
                report["cancelled"] = True
                return
            one_call(store, call, registry, versions, passages_for, retained_for,
                     call_model, config, report, lock)

    workers = concurrency if concurrency is not None else batch_job.PER_PROVIDER * 2
    if workers <= 1:
        for call in pending:
            execute(call)
    else:
        with concurrent.futures.ThreadPoolExecutor(max_workers=workers) as pool:
            list(pool.map(execute, pending))

    if not report["cancelled"]:
        finish(store, run_id)
    return report


def one_call(store, call, registry, versions, passages_for, retained_for,
             call_model, config, report, lock):
    store.update("aci_link_calls", {"id": call["id"]},
                 {"status": "running", "started_at": batch_job.now()})
    with lock:
        report["attempted"] += 1

    source = versions[call["source_version_id"]]
    target = versions[call["target_version_id"]]
    sources = retained_for(store, call["behaviour_slug"], source)
    targets = passages_for(target["spec_id"], target["version"])

    system, user = link_call.compose(
        call["behaviour_slug"], registry, sources, targets,
        compose_links.document_id(source), compose_links.document_id(target))
    provider, model_id = h.resolve(call["model"], config)

    try:
        reply, usage, finish_reason, seconds = call_model(
            provider=provider, model_id=model_id, system=system, user=user,
            kwargs=whole_doc.judge_kwargs(call["model"], model_id, config))
    except Exception as refused:                      # noqa: BLE001
        store.update("aci_link_calls", {"id": call["id"]},
                     {"status": "error", "error": str(refused)[:1000],
                      "finished_at": batch_job.now()})
        with lock:
            report["failed"] += 1
        return

    links, uncovered = link_call.parse(reply, len(sources), len(targets))
    meter = {"sources": len(sources), "uncovered": len(uncovered),
             "finish_reason": finish_reason, "seconds": seconds,
             "prompt_tokens": usage.get("prompt_tokens"),
             "completion_tokens": usage.get("completion_tokens"),
             "cost_usd": batch_job.cost_of(call["model"], usage, config),
             "finished_at": batch_job.now()}

    if not link_call.covered_enough(uncovered):
        store.update("aci_link_calls", {"id": call["id"]}, dict(meter, **{
            "status": "error", "raw_output": reply[:20000],
            "error": f"{len(sources) - len(uncovered)} of {len(sources)} source "
                     f"passages answered for (finish_reason={finish_reason})"}))
        with lock:
            report["failed"] += 1
        return

    rows = link_call.link_rows(call["id"], sources, targets, links)
    store.insert("aci_links", rows, chunk=max(len(rows), 1))
    store.update("aci_link_calls", {"id": call["id"]},
                 dict(meter, status="done", error=None, raw_output=None))
    with lock:
        report["done"] += 1


def finish(store, run_id):
    calls = [c for c in store.select("aci_link_calls") if c["run_id"] == run_id]
    metered = [c["cost_usd"] for c in calls if c.get("cost_usd") is not None]
    patch = {"status": "done", "finished_at": batch_job.now()}
    # Null means unknown and zero means free, and they are not the same claim.
    if metered:
        patch["cost_usd"] = round(sum(metered), 6)
    store.update("aci_link_runs", {"id": run_id}, patch)


def main():
    run_id = os.environ.get("ACI_LINK_RUN_ID")
    if not run_id:
        sys.exit("ACI_LINK_RUN_ID must name the link run to execute")
    report = run(Store.from_env(), run_id)
    print(f"link run {run_id}: {report['attempted']} attempted, {report['done']} done, "
          f"{report['failed']} failed" + (", cancelled" if report["cancelled"] else ""))
    return 1 if report["failed"] else 0


if __name__ == "__main__":
    sys.exit(main())
```

`_cancelled` is local rather than `batch_job.cancelled` because the two read different tables: `batch_job.cancelled` looks in `aci_runs`, and a link run lives in `aci_link_runs`. `batch_job.now`, `batch_job.cost_of`, `batch_job.PER_PROVIDER` and `batch_job.call_openrouter` are reused as they are.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `python3 -m unittest discover -s engine/panel -p "test_link_job.py" -v`

Expected: PASS, all nine tests.

- [ ] **Step 5: Run the whole battery**

Run: `python3 -m unittest discover -s engine/panel -p "test_*.py" 2>&1 | tail -3`

Expected: `OK`.

- [ ] **Step 6: Commit**

```bash
git add engine/panel/link_job.py engine/panel/test_link_job.py
git commit -m "feat: the link job writes one judge's links, or keeps the reply that would not parse"
```

---

### Task 5: What the panel asserts

**Files:**
- Create: `engine/panel/link_consensus.py`
- Test: `engine/panel/test_link_consensus.py`

**Interfaces:**
- Consumes: `link_call.SEVERITY`.
- Produces:
  - `MAJORITY = 2`
  - `LINKED = "linked"`, `SILENT = "silent"`, `CONTESTED = "contested"`
  - `assertions(rows_by_judge) -> {source_locator: entry}` where `rows_by_judge` is `{judge: [aci_links row]}` and `entry` is
    `{"state": str, "relation": str|None, "source_force": str, "judges_linking": int, "judges": [str], "targets": [{"locator": str, "relation": str|None, "target_force": str, "judges": [str], "rationales": {judge: str}}]}`

- [ ] **Step 1: Write the failing test**

Create `engine/panel/test_link_consensus.py`:

```python
"""What three judges' links let the index assert, and what it must not."""
import sys
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import link_consensus            # noqa: E402


def link(source, target, relation="same", source_force="nobody",
         target_force="user", rationale="because."):
    return {"source_locator": source, "target_locator": target, "relation": relation,
            "source_force": source_force, "target_force": target_force,
            "rationale": rationale}


def absent(source, rationale="nothing found."):
    return {"source_locator": source, "target_locator": None, "relation": "absent",
            "source_force": None, "target_force": None, "rationale": rationale}


class AssertionsTest(unittest.TestCase):
    def test_two_judges_naming_a_counterpart_assert_a_link(self):
        out = link_consensus.assertions({
            "a": [link("s1", "t1")], "b": [link("s1", "t1")], "c": [absent("s1")]})
        self.assertEqual(out["s1"]["state"], link_consensus.LINKED)
        self.assertEqual(out["s1"]["relation"], "same")
        self.assertEqual(out["s1"]["judges_linking"], 2)

    def test_one_judge_alone_asserts_nothing(self):
        out = link_consensus.assertions({
            "a": [link("s1", "t1")], "b": [absent("s1")], "c": [absent("s1")]})
        self.assertEqual(out["s1"]["state"], link_consensus.CONTESTED)

    def test_all_three_saying_absent_assert_a_silence(self):
        out = link_consensus.assertions({
            "a": [absent("s1")], "b": [absent("s1")], "c": [absent("s1")]})
        self.assertEqual(out["s1"]["state"], link_consensus.SILENT)
        self.assertIsNone(out["s1"]["relation"])

    def test_two_judges_of_three_saying_absent_do_not_assert_a_silence(self):
        """A silence is the strongest claim this analysis makes. One judge
        finding a counterpart is enough to withhold it."""
        out = link_consensus.assertions({
            "a": [absent("s1")], "b": [absent("s1")], "c": [link("s1", "t1")]})
        self.assertEqual(out["s1"]["state"], link_consensus.CONTESTED)

    def test_adjacent_targets_still_count_as_one_linked_passage(self):
        """A norm can sit across two paragraphs. Agreement is about the source."""
        out = link_consensus.assertions({
            "a": [link("s1", "t1")], "b": [link("s1", "t2")], "c": [absent("s1")]})
        self.assertEqual(out["s1"]["state"], link_consensus.LINKED)
        self.assertEqual(out["s1"]["relation"], "same")
        self.assertEqual([t["locator"] for t in out["s1"]["targets"]], ["t1", "t2"])
        self.assertEqual([t["judges"] for t in out["s1"]["targets"]], [["a"], ["b"]])

    def test_a_contradiction_needs_two_judges(self):
        out = link_consensus.assertions({
            "a": [link("s1", "t1", relation="contradiction")],
            "b": [link("s1", "t1", relation="same")],
            "c": [link("s1", "t1", relation="same")]})
        self.assertEqual(out["s1"]["relation"], "same")

        agreed = link_consensus.assertions({
            "a": [link("s1", "t1", relation="contradiction")],
            "b": [link("s1", "t1", relation="contradiction")],
            "c": [link("s1", "t1", relation="same")]})
        self.assertEqual(agreed["s1"]["relation"], "contradiction")

    def test_a_three_way_split_leaves_the_relation_unsettled(self):
        out = link_consensus.assertions({
            "a": [link("s1", "t1", relation="same")],
            "b": [link("s1", "t1", relation="nuance")],
            "c": [link("s1", "t1", relation="stricter_source")]})
        self.assertEqual(out["s1"]["state"], link_consensus.LINKED)
        self.assertIsNone(out["s1"]["relation"])

    def test_each_judges_gravest_relation_is_the_one_counted(self):
        """A judge that found a contradiction anywhere on a passage has said so
        about the passage, whatever else it also linked."""
        out = link_consensus.assertions({
            "a": [link("s1", "t1", relation="same"),
                  link("s1", "t2", relation="contradiction")],
            "b": [link("s1", "t2", relation="contradiction")],
            "c": [absent("s1")]})
        self.assertEqual(out["s1"]["relation"], "contradiction")

    def test_a_force_two_judges_give_is_asserted_and_a_split_is_unstated(self):
        out = link_consensus.assertions({
            "a": [link("s1", "t1", source_force="priority")],
            "b": [link("s1", "t1", source_force="priority")],
            "c": [link("s1", "t1", source_force="nobody")]})
        self.assertEqual(out["s1"]["source_force"], "priority")

        split = link_consensus.assertions({
            "a": [link("s1", "t1", source_force="priority")],
            "b": [link("s1", "t1", source_force="nobody")],
            "c": [link("s1", "t1", source_force="operator")]})
        self.assertEqual(split["s1"]["source_force"], "unstated")

    def test_a_targets_force_is_asserted_by_the_judges_that_named_that_target(self):
        out = link_consensus.assertions({
            "a": [link("s1", "t1", target_force="user")],
            "b": [link("s1", "t1", target_force="user")],
            "c": [link("s1", "t2", target_force="nobody")]})
        by_locator = {t["locator"]: t for t in out["s1"]["targets"]}
        self.assertEqual(by_locator["t1"]["target_force"], "user")
        self.assertEqual(by_locator["t2"]["target_force"], "unstated")

    def test_every_rationale_is_kept_against_its_judge(self):
        out = link_consensus.assertions({
            "a": [link("s1", "t1", rationale="a says so.")],
            "b": [link("s1", "t1", rationale="b says so.")],
            "c": [absent("s1", rationale="c found nothing.")]})
        target = out["s1"]["targets"][0]
        self.assertEqual(target["rationales"], {"a": "a says so.", "b": "b says so."})
        self.assertEqual(out["s1"]["silences"], {"c": "c found nothing."})

    def test_a_passage_only_one_judge_answered_for_is_contested_not_silent(self):
        out = link_consensus.assertions({"a": [absent("s1")], "b": [], "c": []})
        self.assertEqual(out["s1"]["state"], link_consensus.CONTESTED)


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `python3 -m unittest discover -s engine/panel -p "test_link_consensus.py" -v`

Expected: FAIL, `ModuleNotFoundError: No module named 'link_consensus'`.

- [ ] **Step 3: Write the implementation**

Create `engine/panel/link_consensus.py`:

```python
"""What the panel asserts, from what each judge said.

Every link a judge gave is stored. What the index asserts is derived here, at
read time, so a threshold can be redrawn without paying for another run. It is
the same division the reader keeps between verdicts, which are data, and bands,
which are a display rule over them.

The unit of agreement is the source passage, not the pair. A norm can sit across
two adjacent paragraphs, so one judge cites the ¶12 and another the ¶13, and
counting agreement pair by pair would report a disagreement where the three
judges say the same thing.
"""

import collections

import link_call

# Two of the index's three judges. Stated as a number rather than a fraction
# because the panel is three and a fraction would invite rounding.
MAJORITY = 2

LINKED = "linked"
SILENT = "silent"
CONTESTED = "contested"


def _gravest(relations):
    return min(relations, key=link_call.SEVERITY.index)


def _agreed(values, floor=MAJORITY, fallback=None):
    """The value at least `floor` judges give, or `fallback`."""
    if not values:
        return fallback
    value, count = collections.Counter(values).most_common(1)[0]
    return value if count >= floor else fallback


def assertions(rows_by_judge):
    """{source_locator: what the panel asserts about it}.

    `rows_by_judge` is {judge: [aci_links row]} for one cell and one direction.
    Every judge of the panel must appear, including one whose rows are empty:
    how many judges were asked is what a silence is measured against.
    """
    judges = sorted(rows_by_judge)
    by_source = collections.defaultdict(lambda: collections.defaultdict(list))
    for judge in judges:
        for row in rows_by_judge[judge]:
            by_source[row["source_locator"]][judge].append(row)

    out = {}
    for source_locator, rows_of in sorted(by_source.items()):
        linking = {judge: [r for r in rows if r["relation"] != "absent"]
                   for judge, rows in rows_of.items()}
        linking = {judge: rows for judge, rows in linking.items() if rows}
        silences = {judge: rows[0]["rationale"] for judge, rows in rows_of.items()
                    if judge not in linking and rows}

        if len(linking) >= MAJORITY:
            state = LINKED
        elif not linking and len(silences) == len(judges):
            state = SILENT
        else:
            state = CONTESTED

        # Each judge speaks once about the passage, with its gravest relation:
        # a judge that found a contradiction anywhere on it has said so about
        # the passage, whatever else it also linked.
        relation = _agreed([_gravest([r["relation"] for r in rows])
                            for rows in linking.values()]) if linking else None
        source_force = _agreed([rows[0]["source_force"] for rows in linking.values()],
                               fallback="unstated") if linking else "unstated"

        targets = collections.defaultdict(dict)
        for judge, rows in linking.items():
            for row in rows:
                targets[row["target_locator"]][judge] = row

        out[source_locator] = {
            "state": state,
            "relation": relation,
            "source_force": source_force,
            "judges_linking": len(linking),
            "judges": judges,
            "silences": silences,
            "targets": [{
                "locator": locator,
                "relation": _agreed([row["relation"] for row in named.values()]),
                "target_force": _agreed([row["target_force"] for row in named.values()],
                                        fallback="unstated"),
                "judges": sorted(named),
                "rationales": {judge: row["rationale"]
                               for judge, row in sorted(named.items())},
            } for locator, named in sorted(targets.items())],
        }
    return out
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `python3 -m unittest discover -s engine/panel -p "test_link_consensus.py" -v`

Expected: PASS, all twelve tests.

- [ ] **Step 5: Commit**

```bash
git add engine/panel/link_consensus.py engine/panel/test_link_consensus.py
git commit -m "feat: what three judges' links let the index assert"
```

---

### Task 6: The report

**Files:**
- Create: `engine/panel/link_report.py`
- Test: `engine/panel/test_link_report.py`

**Interfaces:**
- Consumes: `link_consensus.assertions`, `compose_links.retained_passages`, `compose_links.document_id`, `harness.passages`.
- Produces: `report(store, run_id, passages_for=None, retained_for=None) -> dict`, the JSON document; `render(report) -> str`, its markdown; `write(store, run_id, out_dir) -> Path`; `main(argv=None) -> int`.

- [ ] **Step 1: Write the failing test**

Create `engine/panel/test_link_report.py`:

```python
"""One run to a report: the numbers a reader of the pilot needs."""
import json
import sys
import tempfile
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(ROOT / "engine"))
import link_report               # noqa: E402

RUN = "link-run-1"
SOURCES = [("src-1", "A > B", "The document should say what it means."),
           ("src-2", "A > C", "It should say what it does not mean.")]
TARGETS = [("tgt-1", "X > Y", "This document says what it means.")]


def call_row(n, model):
    return {"id": f"link-call-{n}", "run_id": RUN, "behaviour_slug": "defined-behaviour",
            "source_version_id": "v-corpus", "target_version_id": "v-second",
            "model": model, "status": "done", "cost_usd": 0.5}


def link(call_id, source, target, relation="same"):
    return {"call_id": call_id, "source_locator": source, "target_locator": target,
            "relation": relation, "source_force": "nobody", "target_force": "user",
            "rationale": "because."}


def absent(call_id, source):
    return {"call_id": call_id, "source_locator": source, "target_locator": None,
            "relation": "absent", "source_force": None, "target_force": None,
            "rationale": "nothing found."}


class FakeStore:
    def __init__(self):
        self.tables = {
            "aci_link_runs": [{"id": RUN, "status": "done", "panel": ["a", "b", "c"],
                               "cost_usd": 1.5, "estimated_usd": 2.0,
                               "prompt_sha256": "abc", "behaviours": {}}],
            "aci_link_calls": [call_row(1, "a"), call_row(2, "b"), call_row(3, "c")],
            "aci_links": [
                link("link-call-1", "src-1", "tgt-1"),
                link("link-call-2", "src-1", "tgt-1"),
                absent("link-call-3", "src-1"),
                absent("link-call-1", "src-2"),
                absent("link-call-2", "src-2"),
                absent("link-call-3", "src-2")],
            "aci_spec_versions": [
                {"id": "v-corpus", "spec_id": "corpus", "version": "2026-01-01",
                 "markdown": "", "source_url": ""},
                {"id": "v-second", "spec_id": "second", "version": "2026-02-01",
                 "markdown": "", "source_url": ""}],
        }

    def select(self, table, params=None):
        return [dict(r) for r in self.tables.get(table, [])]


class ReportTest(unittest.TestCase):
    def report(self):
        return link_report.report(
            FakeStore(), RUN,
            passages_for=lambda spec, version: SOURCES if spec == "corpus" else TARGETS,
            retained_for=lambda store, slug, version: SOURCES)

    def test_one_direction_with_its_counts(self):
        out = self.report()
        self.assertEqual(len(out["directions"]), 1)
        direction = out["directions"][0]
        self.assertEqual(direction["behaviour"], "defined-behaviour")
        self.assertEqual(direction["source"], "corpus@2026-01-01")
        self.assertEqual(direction["target"], "second@2026-02-01")
        self.assertEqual(direction["counts"],
                         {"sources": 2, "linked": 1, "silent": 1, "contested": 0,
                          "contradictions": 0})

    def test_each_source_carries_its_quote_and_its_targets_quotes(self):
        direction = self.report()["directions"][0]
        first = direction["sources"][0]
        self.assertEqual(first["locator"], "src-1")
        self.assertIn("say what it means", first["quote"])
        self.assertIn("says what it means", first["targets"][0]["quote"])

    def test_the_agreement_rate_is_reported(self):
        direction = self.report()["directions"][0]
        self.assertEqual(direction["agreement"]["unanimous"], 1)
        self.assertEqual(direction["agreement"]["sources"], 2)

    def test_the_run_carries_its_cost_and_its_panel(self):
        out = self.report()
        self.assertEqual(out["run"]["cost_usd"], 1.5)
        self.assertEqual(out["run"]["panel"], ["a", "b", "c"])

    def test_the_markdown_names_every_state_and_quotes_the_passages(self):
        text = link_report.render(self.report())
        self.assertIn("corpus@2026-01-01 -> second@2026-02-01", text)
        self.assertIn("linked", text)
        self.assertIn("silent", text)
        self.assertIn("say what it means", text)

    def test_writing_leaves_a_markdown_and_a_json_file(self):
        with tempfile.TemporaryDirectory() as out_dir:
            folder = link_report.write(
                FakeStore(), RUN, out_dir,
                passages_for=lambda spec, version: SOURCES if spec == "corpus" else TARGETS,
                retained_for=lambda store, slug, version: SOURCES)
            self.assertTrue((folder / "links.md").exists())
            data = json.loads((folder / "links.json").read_text())
            self.assertEqual(data["run"]["id"], RUN)


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `python3 -m unittest discover -s engine/panel -p "test_link_report.py" -v`

Expected: FAIL, `ModuleNotFoundError: No module named 'link_report'`.

- [ ] **Step 3: Write the implementation**

Create `engine/panel/link_report.py`:

```python
#!/usr/bin/env python3
"""One link run, read.

    python3 engine/panel/link_report.py --run=<uuid>

Writes two files into artefacts/: links.md to read, and links.json for whatever
comes next. The report is what the first run is for, so it carries the numbers a
reader has to weigh -- how many passages were linked, contradicted or found
unanswered, and how often the three judges agreed -- beside the passages
themselves.
"""

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(HERE.parent))
sys.path.insert(0, str(HERE.parent / "spec-cite"))

import compose_links              # noqa: E402
import index_store                # noqa: E402
import link_consensus             # noqa: E402
from store import Store           # noqa: E402

h = compose_links.h


def report(store, run_id, passages_for=None, retained_for=None):
    """The whole run as a plain dictionary: one entry per direction."""
    passages_for = passages_for or h.passages
    retained_for = retained_for or compose_links.retained_passages

    run = next(r for r in store.select("aci_link_runs") if r["id"] == run_id)
    calls = [c for c in store.select("aci_link_calls") if c["run_id"] == run_id]
    links = store.select("aci_links")
    versions = {v["id"]: v for v in store.select("aci_spec_versions")}
    by_call = {}
    for row in links:
        by_call.setdefault(row["call_id"], []).append(row)

    cells = {}
    for call in calls:
        key = (call["behaviour_slug"], call["source_version_id"],
               call["target_version_id"])
        cells.setdefault(key, []).append(call)

    directions = []
    for (slug, source_id, target_id), cell in sorted(cells.items()):
        source, target = versions[source_id], versions[target_id]
        quotes = {p[0]: p[2] for p in retained_for(store, slug, source)}
        quotes.update({p[0]: p[2]
                       for p in passages_for(target["spec_id"], target["version"])})
        asserted = link_consensus.assertions(
            {call["model"]: by_call.get(call["id"], []) for call in cell})

        sources = []
        for locator, entry in asserted.items():
            sources.append({
                "locator": locator,
                "quote": quotes.get(locator, ""),
                "state": entry["state"],
                "relation": entry["relation"],
                "source_force": entry["source_force"],
                "judges_linking": entry["judges_linking"],
                "silences": entry["silences"],
                "targets": [dict(found, quote=quotes.get(found["locator"], ""))
                            for found in entry["targets"]],
            })

        counts = {
            "sources": len(sources),
            "linked": sum(1 for s in sources if s["state"] == link_consensus.LINKED),
            "silent": sum(1 for s in sources if s["state"] == link_consensus.SILENT),
            "contested": sum(1 for s in sources if s["state"] == link_consensus.CONTESTED),
            "contradictions": sum(1 for s in sources if s["relation"] == "contradiction"),
        }
        unanimous = sum(1 for s in sources
                        if s["judges_linking"] in (0, len(cell)))
        directions.append({
            "behaviour": slug,
            "source": compose_links.document_id(source),
            "target": compose_links.document_id(target),
            "judges": sorted(call["model"] for call in cell),
            "counts": counts,
            "agreement": {"sources": len(sources), "unanimous": unanimous},
            "sources": sources,
        })

    return {"run": {"id": run["id"], "panel": run["panel"],
                    "status": run["status"],
                    "estimated_usd": run.get("estimated_usd"),
                    "cost_usd": run.get("cost_usd"),
                    "prompt_sha256": run.get("prompt_sha256")},
            "directions": directions}


def render(data):
    """The markdown. Plain, and in the order a reader wants: the counts first,
    then every passage with what the panel made of it."""
    out = [f"# Link run {data['run']['id']}", ""]
    run = data["run"]
    out.append(f"Panel: {', '.join(run['panel'])}. Status: {run['status']}. "
               f"Estimated ${run.get('estimated_usd')}, cost ${run.get('cost_usd')}.")
    out.append("")
    for direction in data["directions"]:
        counts = direction["counts"]
        out.append(f"## {direction['behaviour']}: {direction['source']} "
                   f"-> {direction['target']}")
        out.append("")
        out.append(f"{counts['sources']} source passages: {counts['linked']} linked "
                   f"({counts['contradictions']} contradictions), {counts['silent']} "
                   f"silent, {counts['contested']} contested. The judges were "
                   f"unanimous on {direction['agreement']['unanimous']} of "
                   f"{direction['agreement']['sources']}.")
        out.append("")
        for source in direction["sources"]:
            relation = source["relation"] or "unsettled"
            out.append(f"### [{source['state']}, {relation}] {source['locator']}")
            out.append("")
            out.append(f"> {source['quote']}")
            out.append("")
            out.append(f"Force: {source['source_force']}.")
            out.append("")
            for target in source["targets"]:
                out.append(f"- **{target['relation'] or 'unsettled'}** "
                           f"({', '.join(target['judges'])}, force "
                           f"{target['target_force']}) {target['locator']}")
                out.append(f"  > {target['quote']}")
                for judge, rationale in target["rationales"].items():
                    out.append(f"  - {judge}: {rationale}")
            for judge, rationale in source["silences"].items():
                out.append(f"- **none** ({judge}): {rationale}")
            out.append("")
    return "\n".join(out) + "\n"


def write(store, run_id, out_dir, passages_for=None, retained_for=None):
    data = report(store, run_id, passages_for, retained_for)
    stamp = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H-%M-%S")
    folder = Path(out_dir) / f"{stamp}-links-{run_id[:8]}"
    folder.mkdir(parents=True, exist_ok=True)
    (folder / "links.md").write_text(render(data), encoding="utf-8")
    (folder / "links.json").write_text(
        json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")
    return folder


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--run", required=True, help="an aci_link_runs id")
    parser.add_argument("--out", default=str(ROOT / "artefacts"),
                        help="where the report goes (default: artefacts/)")
    args = parser.parse_args(argv)

    store = Store.from_env()
    index_store.install_registry(store)
    folder = write(store, args.run, args.out)
    print(f"written to {folder}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `python3 -m unittest discover -s engine/panel -p "test_link_report.py" -v`

Expected: PASS, all six tests.

- [ ] **Step 5: Run the whole offline battery, as CI does**

```bash
python3 -m unittest discover -s engine -p "test_*.py" 2>&1 | tail -3
python3 -m unittest discover -s engine/panel -p "test_*.py" 2>&1 | tail -3
python3 -m unittest discover -s tests 2>&1 | tail -3
node --test app/lib/__tests__/*.test.mjs 2>&1 | tail -5
```

Expected: `OK` from each of the three Python discoveries, and `pass` with no `fail` from node.

- [ ] **Step 6: Commit**

```bash
git add engine/panel/link_report.py engine/panel/test_link_report.py
git commit -m "feat: read a link run as a report, with the judges' agreement in it"
```

---

### Task 7: The first run

This task spends real money and needs Task 1 merged. Do not start it until the tables answer and the operator has said to go ahead.

**Files:**
- No file in the repository changes. The outputs are rows in the database and a folder in `artefacts/`, which is not committed.

**Interfaces:**
- Consumes: everything above.
- Produces: one `aci_link_runs` row, six `aci_link_calls` rows, their links, and one report.

- [ ] **Step 1: Find the two document version ids**

```bash
python3 -c "
import sys; sys.path.insert(0, 'engine')
from store import Store
s = Store.from_env()
for v in s.select('aci_spec_versions'):
    print(v['id'], v['spec_id'] + '@' + v['version'])
"
```

Expected: a line for `anthropic--constitution@2026-01-20` and one for `openai--model-spec@2026-08-18`. Keep both ids.

- [ ] **Step 2: Price the run without writing it**

```bash
python3 engine/panel/compose_links.py \
  --behaviours=honesty-and-non-deception \
  --documents=<constitution id>,<model spec id>
```

Expected: `calls 6`, a panel of three judges, and an estimate between one and four dollars. A number outside that range means something is wrong with the cell choice: stop and read the source counts before spending.

- [ ] **Step 3: Write the run**

```bash
python3 engine/panel/compose_links.py \
  --behaviours=honesty-and-non-deception \
  --documents=<constitution id>,<model spec id> --go
```

Expected: `written: link run <uuid>`. Keep the id.

- [ ] **Step 4: Execute it**

```bash
ACI_LINK_RUN_ID=<uuid> python3 engine/panel/link_job.py
```

Expected: `6 attempted, 6 done, 0 failed`. A failed call keeps its raw output: read it with

```bash
python3 -c "
import sys; sys.path.insert(0, 'engine')
from store import Store
s = Store.from_env()
for c in s.select('aci_link_calls'):
    if c['status'] == 'error':
        print(c['model'], c['error'])
        print((c['raw_output'] or '')[:2000])
"
```

Relaunching the same command is the retry, and it takes only what is not done.

- [ ] **Step 5: Write the report**

```bash
python3 engine/panel/link_report.py --run=<uuid>
```

Expected: `written to artefacts/<stamp>-links-<id>/`.

- [ ] **Step 6: Answer the five questions the design set**

Read `links.md` and write the answers into the pull request description, or into a short note beside it:

1. How often were the three judges unanimous, per direction? If no source passage reached `silent`, say so: either the bar or the task is wrong.
2. Did the white-lie pair come back `stricter_source`? The constitution's passage rules out even praising a disliked gift; the model spec's `#do_not_lie` allows politeness over "Do I look fat in these jeans?". A `contradiction` there means the prompt is miscalibrated.
3. Did the outcome-ordering pair come back `contradiction`, from at least two judges? The model spec ranks violating an explicit instruction below lying; the constitution wants honesty to function nearly as a hard constraint.
4. Did every call clear the completeness floor, and was the cost within the estimate?
5. Were counterparts found outside the behaviour's own retained passages? That is what justifies giving the whole document as the target.

- [ ] **Step 7: Record what the run says about the thresholds**

If the answers show a threshold is wrong, do not change the code in this task. Write down what the numbers were, and open that as its own change with its own review. The thresholds are derived at read time precisely so that this costs no money.

---

## Self-review

Run through this after the last task, before asking for review of the whole branch.

- **Spec coverage.** Five relations and their tests: Task 2. Five forces including `priority`: Task 2. Sources by behaviour, target whole document: Tasks 3 and 4. Both directions: Task 3. No forced link, absence as a row: Tasks 2 and 4. One link per pair, gravest relation: Task 2. Completeness floor: Tasks 2 and 4. Three tables: Task 1. Two CLIs: Tasks 3 and 4. Agreement at source level, two of three, unanimous silence, contradiction needing two judges: Task 5. Report with agreement: Task 6. The pilot and its five questions: Task 7. The tests the design names: Tasks 2 to 6.
- **Placeholders.** There are none. Every code step carries the code.
- **Type consistency.** `parse` returns `(links, uncovered)` in Tasks 2 and 4. `link_rows(call_id, sources, targets, links)` in Tasks 2 and 4. `retained_passages(store, slug, version, passages_for=None)` in Tasks 3, 4 and 6, injected in the last two as `retained_for`. `assertions(rows_by_judge)` in Tasks 5 and 6. `document_id(version)` in Tasks 3, 4 and 6.
