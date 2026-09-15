# One panel, documents as versions, and a judged depth: implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reshape the index as `docs/superpowers/specs/2026-09-14-one-panel-documents-as-versions-and-judged-depth-design.md` describes, on `develop`, so every behaviour with a brief can be judged again on three documents and published with a 0 to 4 depth.

**Architecture:** The database only gains (a depth table, documents copied under lab-prefixed names). The engine judges a named version, gives each judge a small depth call after a cell's passages, and publishes with the configuration's one panel. The builders stop reading sets, human verdicts and the strict variant, and key coverage by document id (`<lab>--<document>@<version>`, which is also the head of every locator). The portal lists versions as documents and offers no panel or set; the reader shows each behaviour's depth beside its name; the MCP answers carry the depth and lose their comparability caveat.

**Tech Stack:** Python 3 standard library (engine, `unittest`), Next.js server components and routes (`app/`), `node --test` (`app/lib`), plain browser JavaScript (`site/spec-reader`), Playwright walkers, Supabase Postgres migrations in `polaris-supabase`.

## Global constraints

- Work on `develop` in `/Users/sverbo/Desktop/Codes/Polaris/ai-character-index`. Never push `main`.
- Everything written to a repository is English: code, comments, tests, commit messages. Site copy is British English, sentence case, no em dashes.
- The database only gains on `develop`: `create table`, `insert`; never `drop`, `delete`, `alter ... drop`, `rename`. The one exception is Task 15 step 1, deleting a behaviour row nothing references.
- Migrations live only in `polaris-supabase`. Its CI cannot apply (its Supabase token lacks privileges), so a merged migration is applied by hand with `supabase db push` from `polaris-supabase/evals`.
- Python stays standard library only. Tests run as `python3 <file>`.
- A document's id is `<lab>--<document>@<version>`; `aci_specs.id` is `<lab>--<document>`; a version label is a date `YYYY-MM-DD`; a document name matches `^[a-z]+(-[a-z]+)*$`.
- The panel is `display.panel` in `engine/panel/panel-config.json` (`frontier_fast`). The portal never offers another.
- Depth prompt: `engine/panel/prompts/depth-v1.txt`. Depth reply: `DEPTH: <0-4>` and `RATIONALE: <sentence>`. Depth table: `aci_depths`, one row per passage call.
- Nothing spends money without the operator's explicit go (Task 15 marks the gates).
- Commit messages follow the repository's form (`feat: ...`, `fix: ...`, `docs: ...`, `test: ...`) and end with:

```
Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Hc7ZTy4wQ8UubJaH4UuRxE
```

- Baseline before Task 1, all green:

```bash
cd /Users/sverbo/Desktop/Codes/Polaris/ai-character-index
for t in engine/panel/test_panel.py engine/panel/test_judge_call.py engine/panel/test_batch_job.py engine/panel/test_compose_run.py engine/test_job.py engine/test_publish.py engine/test_local_run.py engine/test_store.py engine/test_index_store.py; do python3 $t 2>&1 | tail -1; done
python3 -m unittest discover -s tests 2>&1 | tail -1
node --test app/lib/__tests__/*.test.mjs 2>&1 | grep -E "ℹ (pass|fail)"
```

Expected: every Python line `OK`, `ℹ fail 0`.

---

### Task 1: The expand migration

**Files:**
- Create: `/Users/sverbo/Desktop/Codes/Polaris/polaris-supabase/evals/supabase/migrations/20260914150000_aci_depths_and_documents_named_by_lab.sql`

**Interfaces:**
- Produces: table `aci_depths(call_id uuid pk -> aci_judge_calls.id, status, depth, rationale, passages, raw_output, error, prompt_tokens, completion_tokens, cost_usd, seconds, started_at, finished_at)`; `aci_specs` rows `anthropic--constitution`, `openai--model-spec`; their `aci_spec_versions` copies.

- [ ] **Step 1: Branch**

```bash
cd /Users/sverbo/Desktop/Codes/Polaris/polaris-supabase
git checkout main && git pull --ff-only origin main
git checkout -b aci-depths-and-documents-named-by-lab
```

- [ ] **Step 2: Write the migration**

```sql
-- ai-character-index: a depth from every judge, and documents named by their lab.
--
-- Additive only. The index is being reshaped on its develop branch while main
-- keeps serving from the same tables, so nothing here drops, renames or deletes;
-- a cleanup migration follows the merge.
--
-- aci_depths holds, for each passage call, the depth that judge gave the call's
-- cell on the 0 to 4 scale in methodology/spec-coverage-depth-rubric.md, from a
-- small call made after the cell's passages. It hangs off the call the way
-- aci_judgements does. Its status moves while a job runs, so it takes update.
--
-- A document is a version, and its id is <lab>--<document>@<version>. The two
-- documents the index carries are copied under those names, texts and digests
-- included; the old rows stay until cleanup.

create table aci_depths (
  call_id           uuid primary key references aci_judge_calls(id) on delete cascade,
  status            text not null default 'pending'
                    check (status in ('pending', 'running', 'done', 'error')),
  depth             smallint check (depth between 0 and 4),
  rationale         text,
  passages          integer,
  raw_output        text,
  error             text,
  prompt_tokens     integer,
  completion_tokens integer,
  cost_usd          numeric(12, 6),
  seconds           numeric(10, 2),
  started_at        timestamptz,
  finished_at       timestamptz
);

grant select, insert, update on public.aci_depths to service_role;

insert into aci_specs (id, lab_id, title, short_title, source_url, locator_style)
select case id when 'constitution' then 'anthropic--constitution'
               when 'model-spec'   then 'openai--model-spec' end,
       lab_id, title, short_title, source_url, locator_style
  from aci_specs
 where id in ('constitution', 'model-spec')
on conflict (id) do nothing;

insert into aci_spec_versions (spec_id, version, markdown, content_sha256, source_url, added_by)
select case spec_id when 'constitution' then 'anthropic--constitution'
                    when 'model-spec'   then 'openai--model-spec' end,
       version, markdown, content_sha256, source_url, added_by
  from aci_spec_versions
 where spec_id in ('constitution', 'model-spec')
on conflict (spec_id, content_sha256) do nothing;
```

- [ ] **Step 3: Dry run**

Run: `cd evals && supabase db push --dry-run`
Expected: `Would push these migrations:` followed by exactly `20260914150000_aci_depths_and_documents_named_by_lab.sql`.

- [ ] **Step 4: Commit, push, open the pull request**

```bash
cd /Users/sverbo/Desktop/Codes/Polaris/polaris-supabase
git add evals/supabase/migrations/20260914150000_aci_depths_and_documents_named_by_lab.sql
git commit -m "feat(evals): a depth from every judge, and documents named by their lab" -m "Additive, for ai-character-index's develop branch while main serves from the same tables: aci_depths, one row per passage call, and the two documents copied under <lab>--<document> names with their versions." -m "Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Hc7ZTy4wQ8UubJaH4UuRxE"
git push -u origin aci-depths-and-documents-named-by-lab
gh pr create --base main --title "A depth from every judge, and documents named by their lab" --body "Additive migration for ai-character-index's develop branch. Adds \`aci_depths\` (one row per passage call: the depth that judge gave the cell, 0 to 4) and copies \`constitution\` and \`model-spec\` under \`anthropic--constitution\` and \`openai--model-spec\` with their versions. Nothing is dropped or renamed; main keeps working.

Design: ai-character-index \`docs/superpowers/specs/2026-09-14-one-panel-documents-as-versions-and-judged-depth-design.md\`.

🤖 Generated with [Claude Code](https://claude.com/claude-code)

https://claude.ai/code/session_01Hc7ZTy4wQ8UubJaH4UuRxE"
```

- [ ] **Step 5: Merge and apply**

```bash
gh pr merge --merge --delete-branch
git checkout main && git pull --ff-only origin main
cd evals && supabase db push
```

Expected: `Applying migration 20260914150000_aci_depths_and_documents_named_by_lab.sql...` then `Finished supabase db push.`

- [ ] **Step 6: Verify**

```bash
cd /Users/sverbo/Desktop/Codes/Polaris/ai-character-index
set -a; source .env; set +a
q() { curl -s "$SUPABASE_URL/rest/v1/$1" -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY"; }
q "aci_depths?select=call_id&limit=1"; echo
q "aci_specs?select=id,lab_id,locator_style&id=like.*--*"; echo
q "aci_spec_versions?select=spec_id,version&spec_id=like.*--*"; echo
```

Expected: `[]`; two specs (`anthropic--constitution` path, `openai--model-spec` anchor); two versions (`2026-01-20`, `2025-12-18`).

---

### Task 2: Passages are read from the version a call names

**Files:**
- Create: `engine/panel/test_passages.py`
- Modify: `engine/panel/harness.py` (`passages`)
- Modify: `engine/index_store.py` (`spec_registry`)
- Modify: `engine/test_index_store.py`
- Modify: `.github/workflows/ci.yml` (Judging job suites)

**Interfaces:**
- Produces: `harness.passages(spec, version=None) -> [(locator, section_path, text)]`; `cite.USER_SPEC_META[(spec, version)]["locatorStyle"]` set by `index_store.spec_registry` to `"path"` or `"anchor"`.

- [ ] **Step 1: Write the failing tests**

`engine/panel/test_passages.py`:

```python
"""Passages are read from the version a call names, and located the way the
document says. No network, no credentials: a registry is installed in memory."""
import importlib.util
import sys
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
sys.path.insert(0, str(ROOT / "engine" / "spec-cite"))
import cite                      # noqa: E402

_spec = importlib.util.spec_from_file_location("h", HERE / "harness.py")
h = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(h)

OLD = "# Old corpus\n\n## Only section {#only}\n\nThe old text."
NEW = "# New corpus\n\n## Only section {#only}\n\nThe new text."


def install(style=None):
    meta = {("doc", "2026-01-01"): {"title": "Old"}, ("doc", "2026-06-01"): {"title": "New"}}
    if style:
        for entry in meta.values():
            entry["locatorStyle"] = style
    cite.use_registry({("doc", "2026-01-01"): "old", ("doc", "2026-06-01"): "new"},
                      {"doc": "2026-06-01"}, meta, {"old": OLD, "new": NEW}.__getitem__)


class PassagesTest(unittest.TestCase):
    def tearDown(self):
        cite.reset_registry()

    def test_a_named_version_is_read_rather_than_the_newest(self):
        install()
        [(locator, _section, text)] = h.passages("doc", "2026-01-01")
        self.assertEqual(text, "The old text.")
        self.assertTrue(locator.startswith("doc@2026-01-01 > "))

    def test_without_a_version_the_default_is_read_as_before(self):
        install()
        [(_locator, _section, text)] = h.passages("doc")
        self.assertEqual(text, "The new text.")

    def test_an_anchor_document_is_located_by_anchor(self):
        install("anchor")
        [(locator, _section, _text)] = h.passages("doc", "2026-06-01")
        self.assertEqual(locator, "doc@2026-06-01 > #only > ¶1")

    def test_a_path_document_is_located_by_heading_path(self):
        install("path")
        [(locator, _section, _text)] = h.passages("doc", "2026-06-01")
        self.assertEqual(locator, "doc@2026-06-01 > New corpus > Only section > ¶1")

    def test_a_lab_prefixed_name_parses_as_a_locator(self):
        """A pin, expected to pass already: the grammar's [a-z-]+ carries `--`."""
        spec, version, ref, _span = cite.parse_locator(
            "openai--model-spec@2026-08-18 > #overview > ¶2")
        self.assertEqual((spec, version, ref), ("openai--model-spec", "2026-08-18", "#overview"))


if __name__ == "__main__":
    unittest.main()
```

Add to `engine/test_index_store.py`, inside `SpecRegistryTest`:

```python
    def test_the_locator_style_travels_with_the_version(self):
        _, _, meta, _ = index_store.spec_registry(fake())
        self.assertEqual(meta[("acme", "2026-01-01")]["locatorStyle"], "path")
```

- [ ] **Step 2: Run them to watch them fail**

Run: `python3 engine/panel/test_passages.py; python3 engine/test_index_store.py`
Expected: `TypeError: passages() takes 1 positional argument but 2 were given` (two tests), `test_an_anchor_document_is_located_by_anchor` failing on a path locator, and `KeyError: 'locatorStyle'`.

- [ ] **Step 3: Implement**

`engine/panel/harness.py`, replace `passages`:

```python
def passages(spec, version=None):
    """(locator, section, text) for every content paragraph of one version,
    TOC-filtered -- reuses cite.py.

    `version` names the version read; without it the registry's default is read,
    which is what callers that judge a whole document by name still want. A call
    on an older version must pass it, or it would judge the newer text.

    A section is located by anchor or by heading path as its document's
    `locatorStyle` says. A registry that records no style (the fixtures, the
    command line) keeps the rule that predates the field."""
    out = []
    version, sections, lines = cite.load_spec(spec, version)
    style = cite.USER_SPEC_META.get((spec, version), {}).get("locatorStyle")
    by_anchor = style == "anchor" if style else spec == "model-spec"
    titles = {cite.normalize(s.path_str.split(" > ")[-1]) for s in sections}
    for sec in sections:
        ref = f"#{sec.anchor}" if (by_anchor and sec.anchor) else sec.path_str
        for i, raw in enumerate(cite.segment_blocks(lines, sec.start, sec.end), 1):
            t = cite.normalize(raw)
            if t.strip() and t not in titles:
                out.append((f"{spec}@{version} > {ref} > ¶{i}", sec.path_str, t))
    return out
```

`engine/index_store.py`, in `spec_registry`, replace the `meta[key] = ...` line:

```python
        meta[key] = {"title": spec["title"], "sourceUrl": version["source_url"],
                     "locatorStyle": spec.get("locator_style")}
```

`.github/workflows/ci.yml`, in the `Judging job suites` step, add a line after `python3 engine/panel/test_judge_call.py`:

```yaml
          python3 engine/panel/test_passages.py
```

- [ ] **Step 4: Run the tests and the suites that call passages**

Run:
```bash
python3 engine/panel/test_passages.py && python3 engine/test_index_store.py && python3 engine/panel/test_judge_call.py && python3 engine/panel/test_batch_job.py && python3 engine/test_local_run.py && python3 -m unittest discover -s tests
```
Expected: every suite `OK`.

- [ ] **Step 5: Commit**

```bash
git add engine/panel/test_passages.py engine/panel/harness.py engine/index_store.py engine/test_index_store.py .github/workflows/ci.yml
git commit -m "fix: a call reads the version it names, located the way its document says" -m "harness.passages loaded the registry's default version, so a call on an older version would have judged the newer text; and it chose anchors by the spec being called model-spec rather than by the document's locator_style." -m "Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Hc7ZTy4wQ8UubJaH4UuRxE"
```

---

### Task 3: The reader's bands, in Python

**Files:**
- Create: `engine/panel/bands.py`
- Create: `engine/panel/test_bands.py`
- Modify: `.github/workflows/ci.yml`

**Interfaces:**
- Produces: `bands.tier_band(score, judges, max_cell, related=1) -> "defining" | "core" | "related" | None`; `bands.band_cell(verdicts: {key: {judge: verdict}}, related=1) -> {key: band}`; `bands.shown_by_default(verdicts) -> [key]` (defining and core).

- [ ] **Step 1: Write the failing test**

`engine/panel/test_bands.py`:

```python
"""The job's bands, held to app/lib/bands.mjs by running both.

The depth judge is shown what the reader shows by default, so the job has to
draw the line where the reader draws it. app/lib/bands.mjs is held to the reader
by its own test; this holds the Python to that file."""
import json
import shutil
import subprocess
import sys
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
sys.path.insert(0, str(HERE))
import bands                     # noqa: E402

SHAPES = [[1, 2], [2, 4], [3, 6], [4, 8], [1, 3], [2, 6], [3, 9], [5, 10], [5, 15], [6, 18]]
RELATED = [1, 0.5, 0.25, 0]


def reader_bands(cases):
    script = ("import(process.argv[1]).then(m => console.log(JSON.stringify("
              "JSON.parse(process.argv[2]).map(([s, j, c, r]) => m.tierBand(s, j, c, r)))))")
    result = subprocess.run(
        ["node", "-e", script, (ROOT / "app" / "lib" / "bands.mjs").as_uri(), json.dumps(cases)],
        capture_output=True, text=True, check=True)
    return json.loads(result.stdout)


@unittest.skipUnless(shutil.which("node"), "node runs the server's arithmetic")
class ParityTest(unittest.TestCase):
    def test_every_score_a_cell_can_carry_bands_as_the_server_does(self):
        cases = [[step / 4, judges, cell, related]
                 for judges, cell in SHAPES for related in RELATED
                 for step in range(cell * 4 + 1)]
        self.assertEqual([bands.tier_band(*case) for case in cases], reader_bands(cases))


class ShownTest(unittest.TestCase):
    def test_a_unanimous_core_passage_of_three_judges_is_shown(self):
        self.assertEqual(bands.shown_by_default({"p": {"a": 2, "b": 2, "c": 2}}), ["p"])

    def test_a_passage_two_judges_call_related_is_not(self):
        self.assertEqual(bands.shown_by_default({"p": {"a": 1, "b": 1, "c": 0}}), [])

    def test_one_defining_verdict_raises_the_scale_of_the_whole_cell(self):
        shown = bands.shown_by_default({"high": {"a": 3, "b": 3, "c": 3},
                                        "pair": {"a": 2, "b": 2, "c": 2}})
        self.assertEqual(sorted(shown), ["high", "pair"])

    def test_a_passage_nobody_scored_has_no_band(self):
        self.assertEqual(bands.band_cell({"p": {}}), {"p": None})


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Run it to watch it fail**

Run: `python3 engine/panel/test_bands.py`
Expected: `ModuleNotFoundError: No module named 'bands'`.

- [ ] **Step 3: Implement**

`engine/panel/bands.py`:

```python
"""The reader's tier bands, in Python.

The depth judge is shown the passages a reader sees by default, so the job has to
draw the same line the reader draws. app/lib/bands.mjs already carries the
reader's arithmetic for the server; this carries that file's, and test_bands.py
runs both over every score a cell can hold."""

TIERS = ("defining", "core", "related")


def tier_band(score, judges, max_cell, related=1):
    """The band a score lands in for a cell of `judges` judges, or None.

    Defining is score >= 2j+1, clamped to the cell's maximum; core is >= 2j;
    related is >= j+1 (at least two judges), or the lone judge's own weight."""
    defining_cut = min(2 * judges + 1, max_cell or 2 * judges + 1)
    related_cut = judges + 1 if judges > 1 else (related if related > 0 else 1)
    if score >= defining_cut:
        return "defining"
    if score >= 2 * judges:
        return "core"
    if score >= related_cut:
        return "related"
    return None


def band_cell(verdicts, related=1):
    """{key: band or None} for one cell, from {key: {judge: verdict}}.

    The cell's scale is the largest verdict any judge gave in it, at least 2; each
    passage is scored on its own judge count."""
    max_verdict = max([2] + [v for judged in verdicts.values() for v in judged.values()])
    out = {}
    for key, judged in verdicts.items():
        values = list(judged.values())
        if not values:
            out[key] = None
            continue
        score = sum(v if v >= 2 else (related if v == 1 else 0) for v in values)
        out[key] = tier_band(score, max(1, len(values)), max_verdict * len(values), related)
    return out


def shown_by_default(verdicts):
    """The keys a reader shows before touching a toggle: defining and core."""
    return [key for key, band in band_cell(verdicts).items() if band in ("defining", "core")]
```

`.github/workflows/ci.yml`, `Judging job suites`, add after `test_passages.py`:

```yaml
          python3 engine/panel/test_bands.py
```

- [ ] **Step 4: Run it**

Run: `python3 engine/panel/test_bands.py`
Expected: `OK` (5 tests).

- [ ] **Step 5: Commit**

```bash
git add engine/panel/bands.py engine/panel/test_bands.py .github/workflows/ci.yml
git commit -m "feat: the reader's bands in Python, held to the server's copy" -m "Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Hc7ZTy4wQ8UubJaH4UuRxE"
```

---

### Task 4: One depth call

**Files:**
- Create: `engine/panel/prompts/depth-v1.txt`
- Create: `engine/panel/depth_call.py`
- Create: `engine/panel/test_depth_call.py`
- Modify: `.github/workflows/ci.yml`

**Interfaces:**
- Produces: `depth_call.system_prompt() -> str`; `depth_call.prompt_sha256() -> str`; `depth_call.compose(behaviour, registry, retained: [(locator, section, text)]) -> (system, user)`; `depth_call.parse(reply) -> (depth int | None, rationale str | None)`; `depth_call.NOTHING_RETAINED: str`.

- [ ] **Step 1: Write the failing test**

`engine/panel/test_depth_call.py`:

```python
"""Composing and parsing one depth call. The fixture index supplies the
behaviours; nothing touches a network."""
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
import depth_call                # noqa: E402

RETAINED = [("loc-1", "A > B", "First passage."), ("loc-2", "A > C", "Second passage.")]


class ComposeTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        fixture.install_spec()
        cls.registry = fixture.judging_registry()

    @classmethod
    def tearDownClass(cls):
        cite.reset_registry()

    def test_the_system_prompt_is_the_file_on_disk(self):
        system, _user = depth_call.compose("defined-behaviour", self.registry, RETAINED)
        self.assertEqual(system, (HERE / "prompts" / "depth-v1.txt").read_text())

    def test_the_prompt_carries_the_brief_and_every_retained_passage(self):
        _system, user = depth_call.compose("defined-behaviour", self.registry, RETAINED)
        self.assertIn("NOT this behaviour", user)
        self.assertIn("[1] (§ A > B) First passage.", user)
        self.assertIn("[2] (§ A > C) Second passage.", user)

    def test_the_digest_is_of_the_prompt_on_disk(self):
        expected = hashlib.sha256((HERE / "prompts" / "depth-v1.txt").read_bytes()).hexdigest()
        self.assertEqual(depth_call.prompt_sha256(), expected)


class ParseTest(unittest.TestCase):
    def test_a_well_formed_reply(self):
        self.assertEqual(depth_call.parse("DEPTH: 3\nRATIONALE: Rules, no examples."),
                         (3, "Rules, no examples."))

    def test_reasoning_before_the_answer_is_ignored(self):
        reply = "There are 4 passages to weigh.\nDEPTH: 2\nRATIONALE: General terms only."
        self.assertEqual(depth_call.parse(reply), (2, "General terms only."))

    def test_a_depth_off_the_scale_is_not_a_depth(self):
        self.assertIsNone(depth_call.parse("DEPTH: 5\nRATIONALE: Too high.")[0])
        self.assertIsNone(depth_call.parse("DEPTH: 42\nRATIONALE: Too high.")[0])

    def test_a_reply_without_a_depth_gives_nothing(self):
        self.assertEqual(depth_call.parse("I cannot tell."), (None, None))
        self.assertEqual(depth_call.parse(""), (None, None))


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Run it to watch it fail**

Run: `python3 engine/panel/test_depth_call.py`
Expected: `ModuleNotFoundError: No module named 'depth_call'`.

- [ ] **Step 3: Write the prompt**

`engine/panel/prompts/depth-v1.txt`:

```
You are measuring how deeply an AI alignment document -- a model constitution or a model spec -- covers one target behaviour, so that a reader can see at a glance whether the document addresses it and how much it gives an evaluator to work with.

You are given the behaviour, described by four fields: Behaviour, Definition, Clarifications and Scope. An optional field reading 'none provided' only means it was left blank. You are also given the passages of the document that a panel of judges found to establish the behaviour, each with its section path. These passages are your evidence: do not assume the document says anything they do not show.

Score the document's depth for this behaviour on this scale:

0 = ABSENT: no passage bears on the behaviour.
1 = NAMED: the behaviour appears -- a word or clause, typically inside a list or a passage about something else -- but the document says nothing further about it.
2 = DISCUSSED: the document addresses the behaviour in its own right -- what the norm is, why it matters -- but only in terms too general to grade a response against.
3 = PRESCRIBED: the document states concrete do and don't rules or procedures for the behaviour, specific enough that a grader could quote the document's own sentences as pass criteria.
4 = DEMONSTRATED: prescribed, plus worked examples: concrete scenarios where the document shows the sanctioned response, usable as an answer key for borderline cases.

Boundary tests:
- 2 or 3: could an evaluation score a transcript by quoting the document, or would the grader have to invent the standard? If invent, it is 2.
- 3 or 4: a worked example is a concrete scenario for which the document states the sanctioned response, specific enough to adapt into an evaluation item. Format does not matter: a request and response block and a case described in prose both count. An example of a neighbouring behaviour, or a lone illustration of a broader norm, does not.
- A dedicated section is evidence, not a requirement. Any level can be reached by passages spread across sections, and a dedicated section written only in general terms does not reach 3.

When in doubt between two levels, give the lower.

Answer with exactly two lines and nothing else:
DEPTH: <0, 1, 2, 3 or 4>
RATIONALE: <one sentence naming what is present and what is missing, in the scale's terms>
```

- [ ] **Step 4: Implement**

`engine/panel/depth_call.py`:

```python
"""One depth call: composing its prompt and parsing its reply.

A depth is one judge's reading of how deeply a document covers a behaviour, on
the 0 to 4 scale of methodology/spec-coverage-depth-rubric.md. The judge is shown
only the passages the reader shows by default, which is the evidence the index
publishes. The prompt is a file, and its digest is recorded on the run that uses
it."""

import hashlib
import importlib.util
import re
from pathlib import Path

HERE = Path(__file__).resolve().parent
PROMPT = HERE / "prompts" / "depth-v1.txt"

_spec = importlib.util.spec_from_file_location("h", HERE / "harness.py")
h = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(h)

DEPTH_RE = re.compile(r"^\s*DEPTH\s*:\s*([0-4])\b(?!\d)", re.IGNORECASE | re.MULTILINE)
RATIONALE_RE = re.compile(r"^\s*RATIONALE\s*:\s*(\S.*?)\s*$", re.IGNORECASE | re.MULTILINE)

# What a cell with no retained passage records, without a call: nothing was
# found to grade, which is depth 0 by the scale's own definition.
NOTHING_RETAINED = "No passage was retained for this behaviour in this document."


def system_prompt():
    return PROMPT.read_text()


def prompt_sha256():
    return hashlib.sha256(PROMPT.read_bytes()).hexdigest()


def compose(behaviour, registry, retained):
    """(system, user) for one depth call: the behaviour block, then the retained
    passages numbered in document order."""
    block = h.compose_query(behaviour, "v3", registry)
    body = "\n".join(f"[{i + 1}] (§ {section}) {text}"
                     for i, (_locator, section, text) in enumerate(retained))
    user = (f"{block}\n\nPassages the panel found to establish this behaviour "
            f"({len(retained)}):\n{body}\n\nAnswer with the two lines DEPTH and RATIONALE.")
    return system_prompt(), user


def parse(reply):
    """(depth, rationale): either is None where the reply does not give it."""
    depth = DEPTH_RE.search(reply or "")
    rationale = RATIONALE_RE.search(reply or "")
    return (int(depth.group(1)) if depth else None,
            rationale.group(1) if rationale else None)
```

`.github/workflows/ci.yml`, `Judging job suites`, add after `test_bands.py`:

```yaml
          python3 engine/panel/test_depth_call.py
```

- [ ] **Step 5: Run it**

Run: `python3 engine/panel/test_depth_call.py`
Expected: `OK` (7 tests).

- [ ] **Step 6: Commit**

```bash
git add engine/panel/prompts/depth-v1.txt engine/panel/depth_call.py engine/panel/test_depth_call.py .github/workflows/ci.yml
git commit -m "feat: one depth call, composed from the brief and the passages a reader sees" -m "Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Hc7ZTy4wQ8UubJaH4UuRxE"
```

---

### Task 5: Composing by document, with depths

**Files:**
- Modify: `engine/panel/compose_run.py`
- Modify: `engine/panel/test_compose_run.py`
- Modify: `engine/job.py` (`run_compose`)
- Modify: `engine/test_job.py` (`ComposeTest`)

**Interfaces:**
- Consumes: `harness.passages(spec, version)` (Task 2); `depth_call.system_prompt`, `depth_call.prompt_sha256` (Task 4).
- Produces: `compose_run.plan(store, behaviours, documents, panel_name=None, rubric="v5", config=None, again=False) -> (run, calls)` where `documents` are `aci_spec_versions` ids and `panel_name=None` means `config["display"]["panel"]`; `compose_run.depth_rows(calls) -> [{"call_id", "status": "pending"}]`; `run["config"]["depth_prompt_sha256"]`. Job params for compose: `{"behaviours", "documents", "rubric", "again", "created_by"}`.

- [ ] **Step 1: Write the failing tests**

`engine/panel/test_compose_run.py`: change the old version's label, register it in `setUpClass`, and replace the tests that name specs.

In `FakeStore.__init__`, change the `v-old` row's version to `"2025-06-01"`:

```python
                {"id": "v-old", "spec_id": "corpus", "version": "2025-06-01",
                 "markdown": "x" * 4000, "source_url": ""},
```

Replace `setUpClass` and `plan` in `PlanTest`:

```python
    @classmethod
    def setUpClass(cls):
        fixture.install_spec()
        # An older version of the corpus beside the fixture's own, so a test can
        # name a version that is not the newest.
        cite.SPECS[(fixture.SPEC_NAME, "2025-06-01")] = "corpus"

    def plan(self, store, behaviours=("defined-behaviour", "undefined-behaviour")):
        return compose_run.plan(store, list(behaviours), ["v-new"], "two",
                                config=CONFIG)
```

Replace `test_only_the_newest_version_of_a_spec_is_judged` with:

```python
    def test_the_version_named_is_the_version_judged(self):
        _run, calls = compose_run.plan(FakeStore(), ["defined-behaviour"], ["v-old"],
                                       "two", config=CONFIG)
        self.assertEqual({c["spec_version_id"] for c in calls}, {"v-old"},
                         "a document is a version: an older one is judged as itself")

    def test_a_document_the_index_does_not_carry_is_refused(self):
        with self.assertRaises(SystemExit):
            compose_run.plan(FakeStore(), ["defined-behaviour"], ["v-nope"], "two",
                             config=CONFIG)

    def test_every_call_has_a_pending_depth(self):
        _run, calls = self.plan(FakeStore())
        rows = compose_run.depth_rows(calls)
        self.assertEqual([row["call_id"] for row in rows], [call["id"] for call in calls])
        self.assertTrue(all(row["status"] == "pending" for row in rows))

    def test_the_depth_calls_are_priced(self):
        dear = dict(CONFIG, models={k: dict(v, price_per_mtok=[1000.0, 2000.0])
                                    for k, v in CONFIG["models"].items()})
        run, _calls = compose_run.plan(FakeStore(), ["defined-behaviour"], ["v-new"],
                                       "two", config=dear)
        passages = len(compose_run.h.passages("corpus", "2026-01-01"))
        passages_only = 2 * compose_run.seat_cost(
            "a", 4000 // 4, passages * compose_run.OUTPUT_TOKENS_PER_PASSAGE, dear)
        self.assertGreater(run["estimated_usd"], round(passages_only, 2))

    def test_the_run_records_the_depth_prompt_it_will_use(self):
        run, _calls = self.plan(FakeStore())
        self.assertEqual(run["config"]["depth_prompt_sha256"],
                         compose_run.depth_call.prompt_sha256())

    def test_without_a_panel_the_display_panel_is_used(self):
        config = dict(CONFIG, display={"panel": "two"})
        run, _calls = compose_run.plan(FakeStore(), ["defined-behaviour"], ["v-new"],
                                       config=config)
        self.assertEqual(run["panel"], ["a", "b"])
```

In `test_judging_again_composes_every_seat_a_done_call_already_covers`, `test_the_estimate_follows_the_documents_and_the_prices`, change every `["corpus"]` argument to `["v-new"]`.

`engine/test_job.py`, in `ComposeTest`, replace `composed_with` and the two tests using it, and the stubs:

```python
    def stub(self, plan):
        sys.modules["compose_run"] = type("M", (), {
            "plan": staticmethod(plan),
            "depth_rows": staticmethod(
                lambda calls: [{"call_id": c["id"], "status": "pending"} for c in calls]),
        })

    def composed_with(self, params):
        seen = {}
        def plan(*args, **kwargs):
            seen.update(kwargs, args=args)
            return {"id": "r", "estimated_usd": 1.0}, [{"id": "c1"}]
        self.stub(plan)
        job_module.run_compose(FakeStore(), {"behaviours": ["a"], "documents": ["v-1"]} | params)
        return seen

    def test_judging_again_reaches_the_composer(self):
        self.assertIs(self.composed_with({"again": True}).get("again"), True)

    def test_a_compose_that_does_not_ask_to_judge_again_pays_nothing_twice(self):
        self.assertIs(self.composed_with({}).get("again"), False)

    def test_the_documents_are_composed_with_the_configured_panel(self):
        seen = self.composed_with({})
        self.assertEqual(seen["args"][2], ["v-1"])
        self.assertIsNone(seen["args"][3], "the panel is the configuration's, never a form's")
```

Replace `test_nothing_to_do_writes_nothing_and_says_so`'s stub line with `self.stub(plan)`, and replace `test_a_priced_run_is_written_with_its_calls_and_its_author`:

```python
    def test_a_priced_run_is_written_with_its_calls_its_depths_and_its_author(self):
        store = FakeStore()
        run = {"id": "r-9", "estimated_usd": 3.12}
        calls = [{"id": "c1"}, {"id": "c2"}]
        self.stub(lambda *a, **k: (run, calls))
        result = job_module.run_compose(
            store, {"behaviours": ["a"], "documents": ["x"], "created_by": "Polaris Collective"})
        self.assertEqual(result["run_id"], "r-9")
        self.assertEqual(run["created_by"], "Polaris Collective")
        self.assertEqual([table for table, _ in store.inserted],
                         ["aci_runs", "aci_judge_calls", "aci_depths"])
        self.assertEqual([row["call_id"] for row in store.inserted[2][1]], ["c1", "c2"])
        self.assertIn("$3.12", result["detail"])
```

In `test_nothing_to_do_writes_nothing_and_says_so`, change the params to `{"behaviours": ["a"], "documents": ["x"]}`.

- [ ] **Step 2: Run them to watch them fail**

Run: `python3 engine/panel/test_compose_run.py; python3 engine/test_job.py`
Expected: failures on `depth_rows`, `depth_call`, a `v-old` composed as newest, and `KeyError: 'documents'` in the job.

- [ ] **Step 3: Implement the composer**

`engine/panel/compose_run.py`. Update the module docstring's usage lines:

```python
    python3 engine/panel/compose_run.py --behaviours=a,b --documents=<version id>,<version id>   # priced, not written
    python3 engine/panel/compose_run.py --behaviours=a,b --documents=<version id> --go
```

Add after `import judge_call`:

```python
import depth_call                # noqa: E402
```

Add after `OUTPUT_TOKENS_PER_PASSAGE = 8`:

```python
# A depth call reads the passages the reader shows for a cell, which are not
# known until the passages are judged. Priced on a fixed allowance: the inherited
# run's median cell carried about 2,100 characters of them, its largest 5,600.
DEPTH_PASSAGE_ALLOWANCE = 3000
DEPTH_OUTPUT_TOKENS = 600
```

Replace `plan`:

```python
def plan(store, behaviours, documents, panel_name=None, rubric="v5", config=None,
         again=False):
    """Every call a run would carry, and what it would cost.

    Pure: it reads, it computes, it writes nothing. --go is the only thing that
    writes, and it writes exactly what this returned.

    `documents` are aci_spec_versions ids. A document is a version, judged as
    itself: registering a newer one does not replace it here. `panel_name`
    defaults to the configuration's display panel, the one panel the index
    publishes.

    `again` composes every seat of every cell, including seats a done call already
    covers. Without it, a panel that shares a judge with an earlier run is composed
    without that judge, and a publication cannot use the result: it needs all of a
    cell's judges in one run.
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

    # Cells a done call already covers, so asking twice costs nothing twice --
    # unless the operator asked to judge them again.
    done = set() if again else {
        (c["behaviour_slug"], c["spec_version_id"], c["model"])
        for c in store.select("aci_judge_calls") if c["status"] == "done"}

    prompt = judge_call.system_prompt(rubric)
    depth_prompt = depth_call.system_prompt()
    run_id = str(uuid.uuid4())
    calls, estimate = [], 0.0
    for slug in sorted(behaviours):
        brief = len(json.dumps(registry[slug].get("judging") or {}))
        depth_tokens_in = (len(depth_prompt) + brief + DEPTH_PASSAGE_ALLOWANCE) // CHARS_PER_TOKEN
        for document in sorted(documents):
            version = versions[document]
            tokens_in = len(version["markdown"]) // CHARS_PER_TOKEN
            passages = len(h.passages(version["spec_id"], version["version"]))
            for seat in seats:
                if (slug, version["id"], seat) in done:
                    continue
                calls.append({"id": str(uuid.uuid4()), "run_id": run_id,
                              "behaviour_slug": slug, "spec_version_id": version["id"],
                              "model": seat, "status": "pending"})
                estimate += seat_cost(seat, tokens_in,
                                      passages * OUTPUT_TOKENS_PER_PASSAGE, config)
                estimate += seat_cost(seat, depth_tokens_in, DEPTH_OUTPUT_TOKENS, config)

    run = {"id": run_id, "created_by": "compose_run.py", "status": "pending",
           "rubric": rubric, "prompt": prompt,
           "prompt_sha256": hashlib.sha256(prompt.encode()).hexdigest(),
           "panel": seats,
           "config": config | {"via": judge_call.VIA[rubric],
                               "depth_prompt_sha256": depth_call.prompt_sha256()},
           "behaviours": {slug: registry[slug] for slug in sorted(behaviours)},
           "estimated_usd": round(estimate, 2)}
    return run, calls


def depth_rows(calls):
    """A pending depth for every call: each judge of a cell also gives its depth."""
    return [{"call_id": call["id"], "status": "pending"} for call in calls]
```

Replace `main`'s arguments and writes:

```python
def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--behaviours", required=True,
                        help="comma-separated slugs")
    parser.add_argument("--documents", required=True,
                        help="comma-separated aci_spec_versions ids")
    parser.add_argument("--panel", default=None,
                        help="a configured panel; the display panel by default")
    parser.add_argument("--rubric", default="v5")
    parser.add_argument("--go", action="store_true",
                        help="write the run and its calls; without it, nothing is written")
    parser.add_argument("--again", action="store_true",
                        help="judge again cells a done call already covers; pays twice")
    args = parser.parse_args(argv)

    store = Store.from_env()
    index_store.install_registry(store)
    run, calls = plan(store,
                      [s for s in args.behaviours.split(",") if s],
                      [s for s in args.documents.split(",") if s],
                      args.panel, args.rubric, again=args.again)

    print(f"  panel        {', '.join(run['panel'])}")
    print(f"  calls        {len(calls)}")
    print(f"  estimated    ${run['estimated_usd']}")
    if not calls:
        print("nothing to do: every cell already has a done call")
        return 0
    if not args.go:
        print("nothing written (pass --go to write the run)")
        return 0
    store.insert("aci_runs", [run])
    store.insert("aci_judge_calls", calls)
    store.insert("aci_depths", depth_rows(calls))
    print(f"written: run {run['id']}")
    return 0
```

- [ ] **Step 4: Implement the job**

`engine/job.py`, replace `run_compose`:

```python
def run_compose(store, params):
    """Price a run and write it, spending nothing.

    Pricing lives here rather than in the portal because it reads the panel's own
    model prices and counts the passages of a document through cite.py. A
    JavaScript copy of either would be a second truth, and the first thing it
    would diverge on is money.

    The panel is the configuration's, never a form's: the index publishes one.
    """
    import compose_run
    # plan() resolves passages through cite.py, which registers nothing at import
    # time: a caller installs the registry or gets a loud error naming this line.
    index_store.install_registry(store)
    run, calls = compose_run.plan(
        store, params["behaviours"], params["documents"],
        None, params.get("rubric", "v5"),
        again=bool(params.get("again", False)))
    run["created_by"] = params.get("created_by", "admin portal")
    if not calls:
        # Every cell already has a done call. Nothing to write, and saying so is
        # the answer: the run the operator asked for exists already.
        return {"run_id": None, "detail": "every cell already has a done call"}
    store.insert("aci_runs", [run])
    store.insert("aci_judge_calls", calls)
    store.insert("aci_depths", compose_run.depth_rows(calls))
    return {"run_id": run["id"],
            "detail": f"{len(calls)} calls, ${run['estimated_usd']} estimated"}
```

- [ ] **Step 5: Run the tests**

Run: `python3 engine/panel/test_compose_run.py && python3 engine/test_job.py`
Expected: both `OK`.

- [ ] **Step 6: Commit**

```bash
git add engine/panel/compose_run.py engine/panel/test_compose_run.py engine/job.py engine/test_job.py
git commit -m "feat: a run is composed by document version, with a priced depth for every call" -m "Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Hc7ZTy4wQ8UubJaH4UuRxE"
```

---

### Task 6: The job gives depths

**Files:**
- Modify: `engine/panel/batch_job.py`
- Modify: `engine/panel/test_batch_job.py`

**Interfaces:**
- Consumes: `bands.shown_by_default` (Task 3); `depth_call.compose`, `depth_call.parse`, `depth_call.NOTHING_RETAINED` (Task 4); `aci_depths` rows (Task 5).
- Produces: `batch_job.run(...)` now takes `passages_for(spec, version)`; its report gains `"depths": {"done": int, "failed": int}`; `aci_depths` rows move `pending -> running -> done | error`; the run's `cost_usd` sums calls and depths.

- [ ] **Step 1: Write the failing tests**

`engine/panel/test_batch_job.py`. In `BatchJobTest.go`, change `passages_for=lambda spec: self.passages` to `passages_for=lambda spec, version: self.passages`.

Add after `unparseable`:

```python
def depth_row(n, status="pending"):
    return {"call_id": f"call-{n}", "status": status, "cost_usd": None}


def zero_reply(passage_count):
    return lambda **kwargs: ("\n".join(f"[{i}]: 0" for i in range(1, passage_count + 1)),
                             {"prompt_tokens": 10, "completion_tokens": 5}, "stop", 0.1)
```

Add a class before `RoutingTest`:

```python
class DepthTest(unittest.TestCase):
    """A cell's depths wait for all its passage calls, then each judge gives one."""

    @classmethod
    def setUpClass(cls):
        fixture.install_spec()
        cls.registry = fixture.judging_registry()
        cls.passages = batch_job.h.passages("corpus")

    @classmethod
    def tearDownClass(cls):
        cite.reset_registry()

    def store(self, calls, depths, run_status="pending"):
        store = FakeStore(calls, run_status=run_status)
        store.tables["aci_depths"] = depths
        return store

    def replying(self, passages=None, depth="DEPTH: 3\nRATIONALE: Rules, no examples."):
        asked = []
        passages = passages or good_reply(len(self.passages))
        def model(**kwargs):
            if "DEPTH" in kwargs["system"]:
                asked.append(kwargs["user"])
                return depth, {"prompt_tokens": 20, "completion_tokens": 8}, "stop", 0.1
            return passages(**kwargs)
        return model, asked

    def go(self, store, model):
        return batch_job.run(store, RUN, call_model=model, registry=self.registry,
                             passages_for=lambda spec, version: self.passages,
                             concurrency=1)

    def test_each_judge_gives_a_depth_once_the_cell_is_judged(self):
        store = self.store([call_row(1, "sol"), call_row(2, "fable")],
                           [depth_row(1), depth_row(2)])
        model, asked = self.replying()
        report = self.go(store, model)
        self.assertEqual(len(asked), 2)
        self.assertEqual([d["status"] for d in store.tables["aci_depths"]], ["done", "done"])
        self.assertEqual([d["depth"] for d in store.tables["aci_depths"]], [3, 3])
        self.assertEqual(store.tables["aci_depths"][0]["passages"], len(self.passages))
        self.assertEqual(report["depths"], {"done": 2, "failed": 0})

    def test_a_cell_with_a_failed_passage_call_gives_no_depth_yet(self):
        store = self.store([call_row(1, "sol"), call_row(2, "fable")],
                           [depth_row(1), depth_row(2)])
        replies = iter([unparseable, good_reply(len(self.passages))])
        model, asked = self.replying(passages=lambda **k: next(replies)(**k))
        self.go(store, model)
        self.assertEqual(asked, [])
        self.assertEqual([d["status"] for d in store.tables["aci_depths"]],
                         ["pending", "pending"])

    def test_a_cell_with_no_retained_passage_gets_depth_zero_without_a_call(self):
        store = self.store([call_row(1, "sol"), call_row(2, "fable")],
                           [depth_row(1), depth_row(2)])
        model, asked = self.replying(passages=zero_reply(len(self.passages)))
        self.go(store, model)
        self.assertEqual(asked, [])
        for row in store.tables["aci_depths"]:
            self.assertEqual((row["status"], row["depth"], row["passages"]), ("done", 0, 0))
            self.assertEqual(row["rationale"], batch_job.depth_call.NOTHING_RETAINED)

    def test_an_unparsable_depth_keeps_its_reply_and_fails(self):
        store = self.store([call_row(1, "sol"), call_row(2, "fable")],
                           [depth_row(1), depth_row(2)])
        model, _asked = self.replying(depth="I would rather not grade this.")
        report = self.go(store, model)
        self.assertEqual(report["depths"], {"done": 0, "failed": 2})
        row = store.tables["aci_depths"][0]
        self.assertEqual(row["status"], "error")
        self.assertIn("rather not", row["raw_output"])

    def test_a_relaunch_gives_the_depths_that_failed_and_repeats_no_passage(self):
        store = self.store([call_row(1, "sol"), call_row(2, "fable")],
                           [depth_row(1), depth_row(2)])
        self.go(store, self.replying(depth="no answer")[0])
        report = self.go(store, self.replying()[0])
        self.assertEqual(report["attempted"], 0)
        self.assertEqual([d["status"] for d in store.tables["aci_depths"]], ["done", "done"])

    def test_a_run_composed_without_depths_gives_none(self):
        store = self.store([call_row(1, "sol")], [])
        model, asked = self.replying()
        self.go(store, model)
        self.assertEqual(asked, [])

    def test_a_cancelled_run_gives_no_depth(self):
        store = self.store([call_row(1, "sol", status="done")], [depth_row(1)],
                           run_status="cancelled")
        model, asked = self.replying()
        self.go(store, model)
        self.assertEqual(asked, [])

    def test_the_run_cost_includes_the_depths(self):
        store = self.store([call_row(1, "sol")], [depth_row(1)])
        self.go(store, self.replying()[0])
        rows = store.tables["aci_judge_calls"] + store.tables["aci_depths"]
        expected = round(sum(row["cost_usd"] for row in rows), 6)
        finished = [p for t, m, p in store.updates
                    if t == "aci_runs" and p.get("status") == "done"]
        self.assertEqual(finished[-1]["cost_usd"], expected)
```

- [ ] **Step 2: Run them to watch them fail**

Run: `python3 engine/panel/test_batch_job.py`
Expected: `DepthTest` failures (`KeyError: 'depths'`, depth rows left `pending`).

- [ ] **Step 3: Implement**

`engine/panel/batch_job.py`. Add after `import judge_call`:

```python
import bands                     # noqa: E402
import depth_call                # noqa: E402
```

Replace `run`:

```python
def run(store, run_id, call_model=None, registry=None, passages_for=None,
        concurrency=None, config=None):
    """Execute every call of `run_id` that is not done, then every depth.

    The model call is injected for the same reason the store's transport is: the
    loop's behaviour -- what it takes, what it writes, what it does with a
    failure -- is provable without a network or a key.

    A cell's depths wait for every passage call of the cell to be done, because a
    depth grades the passages the reader shows, and those come from all of the
    cell's judges.
    """
    call_model = call_model or call_openrouter
    config = config or h.load_config()

    run_row = next(r for r in store.select("aci_runs") if r["id"] == run_id)
    if registry is None:
        index_store.install_registry(store)
        registry = index_store.judging_registry(store)
    if passages_for is None:
        passages_for = h.passages

    versions = {v["id"]: v for v in store.select("aci_spec_versions")}
    pending = [c for c in store.select("aci_judge_calls")
               if c["run_id"] == run_id and c["status"] != "done"]

    report = {"attempted": 0, "done": 0, "failed": 0, "cancelled": False,
              "depths": {"done": 0, "failed": 0}}
    if cancelled(store, run_id):
        report["cancelled"] = True
        return report

    store.update("aci_runs", {"id": run_id}, {"status": "running", "started_at": now()})

    lock = threading.Lock()
    gates = {}

    def gate_for(tag):
        provider = config["models"].get(tag, {}).get("provider", tag)
        with lock:
            return gates.setdefault(provider, threading.Semaphore(PER_PROVIDER))

    def execute(call):
        if cancelled(store, run_id):
            report["cancelled"] = True
            return
        with gate_for(call["model"]):
            if cancelled(store, run_id):
                report["cancelled"] = True
                return
            one_call(store, call, run_row, registry, passages_for,
                     versions, call_model, config, report, lock)

    def execute_depth(job):
        call, retained = job
        if cancelled(store, run_id):
            report["cancelled"] = True
            return
        with gate_for(call["model"]):
            if cancelled(store, run_id):
                report["cancelled"] = True
                return
            one_depth(store, call, registry, retained, call_model, config, report, lock)

    workers = concurrency if concurrency is not None else PER_PROVIDER * 2

    def each(work, items):
        if workers <= 1:
            for item in items:
                work(item)
        else:
            with concurrent.futures.ThreadPoolExecutor(max_workers=workers) as pool:
                list(pool.map(work, items))

    each(execute, pending)
    if not report["cancelled"]:
        each(execute_depth, pending_depths(store, run_id, passages_for, versions))
    if not report["cancelled"]:
        finish(store, run_id, report)
    return report
```

Replace `one_call`'s signature and its passage lines:

```python
def one_call(store, call, run_row, registry, passages_for, versions,
             call_model, config, report, lock):
    store.update("aci_judge_calls", {"id": call["id"]},
                 {"status": "running", "started_at": now()})
    with lock:
        report["attempted"] += 1

    version = versions[call["spec_version_id"]]
    passages = passages_for(version["spec_id"], version["version"])
```

(The rest of `one_call` is unchanged.)

Add after `one_call`:

```python
def pending_depths(store, run_id, passages_for, versions):
    """[(call, retained passages)] for every depth still to give.

    A cell's depths wait until all its passage calls are done. A call no depth row
    was written for -- a run composed before depths existed -- has none to give.
    The retained passages are the ones a reader shows by default, from the cell's
    parsed judgements."""
    calls = [c for c in store.select("aci_judge_calls") if c["run_id"] == run_id]
    depths = {d["call_id"]: d for d in store.select("aci_depths")}
    cells = {}
    for call in calls:
        cells.setdefault((call["behaviour_slug"], call["spec_version_id"]), []).append(call)

    jobs, judgements = [], None
    for (_slug, version_id), cell in sorted(cells.items()):
        todo = [c for c in cell if c["id"] in depths and depths[c["id"]]["status"] != "done"]
        if not todo or any(c["status"] != "done" for c in cell):
            continue
        if judgements is None:
            judgements = store.select("aci_judgements")
        model_of = {c["id"]: c["model"] for c in cell}
        votes = {}
        for row in judgements:
            if row["call_id"] in model_of and row.get("parsed", True):
                votes.setdefault(row["locator"], {})[model_of[row["call_id"]]] = row["verdict"]
        shown = set(bands.shown_by_default(votes))
        version = versions[version_id]
        retained = [p for p in passages_for(version["spec_id"], version["version"])
                    if p[0] in shown]
        jobs.extend((call, retained) for call in todo)
    return jobs


def one_depth(store, call, registry, retained, call_model, config, report, lock):
    """One judge's depth for its call's cell. A cell with nothing retained is
    depth 0 without a call; a reply with no DEPTH line keeps its text and fails."""
    match = {"call_id": call["id"]}
    store.update("aci_depths", match, {"status": "running", "started_at": now()})
    if not retained:
        store.update("aci_depths", match, {
            "status": "done", "depth": 0, "rationale": depth_call.NOTHING_RETAINED,
            "passages": 0, "cost_usd": 0, "finished_at": now()})
        with lock:
            report["depths"]["done"] += 1
        return

    system, user = depth_call.compose(call["behaviour_slug"], registry, retained)
    provider, model_id = h.resolve(call["model"], config)
    try:
        reply, usage, finish_reason, seconds = call_model(
            provider=provider, model_id=model_id, system=system, user=user,
            kwargs=h.judge_kwargs(call["model"], model_id, config)
            if hasattr(h, "judge_kwargs") else {})
    except Exception as refused:                      # noqa: BLE001
        store.update("aci_depths", match, {"status": "error", "error": str(refused)[:1000],
                                           "finished_at": now()})
        with lock:
            report["depths"]["failed"] += 1
        return

    depth, rationale = depth_call.parse(reply)
    meter = {"passages": len(retained), "seconds": seconds,
             "prompt_tokens": usage.get("prompt_tokens"),
             "completion_tokens": usage.get("completion_tokens"),
             "cost_usd": cost_of(call["model"], usage, config),
             "finished_at": now()}
    if depth is None:
        store.update("aci_depths", match, dict(meter, **{
            "status": "error", "raw_output": (reply or "")[:20000],
            "error": f"no DEPTH line in the reply (finish_reason={finish_reason})"}))
        with lock:
            report["depths"]["failed"] += 1
        return
    store.update("aci_depths", match, dict(meter, status="done", depth=depth,
                                           rationale=rationale or "", error=None,
                                           raw_output=None))
    with lock:
        report["depths"]["done"] += 1
```

Replace `finish`:

```python
def finish(store, run_id, report):
    calls = [c for c in store.select("aci_judge_calls") if c["run_id"] == run_id]
    ids = {c["id"] for c in calls}
    depths = [d for d in store.select("aci_depths") if d["call_id"] in ids]
    metered = [row["cost_usd"] for row in calls + depths
               if row.get("cost_usd") is not None]
    patch = {"status": "done", "finished_at": now()}
    # Null means unknown and zero means free, and they are not the same claim.
    # The migrated bench carries no per-call cost -- its meter readings lived in
    # a gitignored metrics file -- so summing its calls must leave it unknown.
    if metered:
        patch["cost_usd"] = round(sum(metered), 6)
    store.update("aci_runs", {"id": run_id}, patch)
```

In `main`, extend the printed line:

```python
    print(f"run {run_id}: {report['attempted']} attempted, {report['done']} done, "
          f"{report['failed']} failed, depths {report['depths']['done']} done "
          f"{report['depths']['failed']} failed"
          + (", cancelled" if report["cancelled"] else ""))
    return 1 if report["failed"] or report["depths"]["failed"] else 0
```

`engine/job.py`, in `run_judge`, extend the detail:

```python
    return {"run_id": run_id,
            "detail": f"{report['attempted']} attempted, {report['done']} done, "
                      f"{report['failed']} failed; depths {report['depths']['done']} done, "
                      f"{report['depths']['failed']} failed"}
```

- [ ] **Step 4: Run the tests**

Run: `python3 engine/panel/test_batch_job.py && python3 engine/test_job.py`
Expected: both `OK`.

- [ ] **Step 5: Commit**

```bash
git add engine/panel/batch_job.py engine/panel/test_batch_job.py engine/job.py
git commit -m "feat: each judge gives a depth once its cell is judged" -m "Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Hc7ZTy4wQ8UubJaH4UuRxE"
```

---

### Task 7: Documents are versions, and a cell has a depth

**Files:**
- Modify: `engine/index_store.py` (`documents`, add `cell_depths`)
- Modify: `engine/test_index_store.py`

**Interfaces:**
- Produces: `index_store.documents(store, spec_version_ids)` entries with `id = f"{spec_id}@{version}"`; `index_store.cell_depths(store, cells) -> {(behaviour_slug, spec_version_id): {"mean": float, "judges": {model: {"depth": int, "rationale": str}}}}` for cells whose every done call has a done depth.

- [ ] **Step 1: Write the failing tests**

`engine/test_index_store.py`. Replace `DocumentTest`:

```python
class DocumentTest(unittest.TestCase):
    def test_a_document_is_a_version_named_by_its_spec_and_version(self):
        [doc] = index_store.documents(fake(), ["row-1"])
        self.assertEqual(doc["id"], "acme@2026-01-01")
        self.assertEqual(doc["lab"], "Acme Labs")
        self.assertEqual(doc["title"], "Acme Spec")
        self.assertEqual(doc["shortTitle"], "Acme")
        self.assertEqual(doc["version"], "2026-01-01")
        self.assertEqual(doc["sourceUrl"], "https://example.com/spec")
        self.assertIn("A paragraph.", doc["markdown"])

    def test_two_versions_of_one_spec_are_two_documents(self):
        versions = VERSIONS + [dict(VERSIONS[0], id="row-2", version="2026-06-01")]
        got = index_store.documents(fake(aci_spec_versions=versions), ["row-1", "row-2"])
        self.assertEqual([d["id"] for d in got], ["acme@2026-01-01", "acme@2026-06-01"])

    def test_documents_come_back_in_id_order(self):
        labs = LABS + [{"id": "aardvark", "name": "Aardvark"}]
        specs = SPECS + [dict(SPECS[0], id="aard-spec", lab_id="aardvark")]
        versions = VERSIONS + [dict(VERSIONS[0], id="row-2", spec_id="aard-spec")]
        got = index_store.documents(FakeStore({
            "aci_labs": labs, "aci_specs": specs, "aci_spec_versions": versions}),
            ["row-1", "row-2"])
        self.assertEqual([d["id"] for d in got], ["aard-spec@2026-01-01", "acme@2026-01-01"])
```

Add a class before `if __name__`:

```python
class CellDepthTest(unittest.TestCase):
    CELL = {"run_id": "run-1", "behaviour_slug": "helpfulness", "spec_version_id": "row-1"}

    def store(self, depths):
        calls = [{"id": f"call-{m}", "run_id": "run-1", "behaviour_slug": "helpfulness",
                  "spec_version_id": "row-1", "model": m, "status": "done"}
                 for m in ("sol", "fable", "deepseek")]
        return FakeStore({"aci_judge_calls": calls, "aci_depths": depths})

    def depth(self, model, value, status="done"):
        return {"call_id": f"call-{model}", "status": status, "depth": value,
                "rationale": f"{model} says {value}."}

    def test_a_cell_carries_the_mean_and_every_judge(self):
        got = index_store.cell_depths(self.store(
            [self.depth("sol", 3), self.depth("fable", 3), self.depth("deepseek", 2)]),
            [self.CELL])
        entry = got[("helpfulness", "row-1")]
        self.assertEqual(entry["mean"], 2.7)
        self.assertEqual(list(entry["judges"]), ["deepseek", "fable", "sol"])
        self.assertEqual(entry["judges"]["deepseek"], {"depth": 2, "rationale": "deepseek says 2."})

    def test_a_cell_missing_a_depth_is_left_out(self):
        got = index_store.cell_depths(self.store(
            [self.depth("sol", 3), self.depth("fable", 3)]), [self.CELL])
        self.assertEqual(got, {})

    def test_a_depth_that_is_not_done_does_not_count(self):
        got = index_store.cell_depths(self.store(
            [self.depth("sol", 3), self.depth("fable", 3),
             self.depth("deepseek", None, status="error")]), [self.CELL])
        self.assertEqual(got, {})
```

- [ ] **Step 2: Run them to watch them fail**

Run: `python3 engine/test_index_store.py`
Expected: failures on `acme-labs` ids and `AttributeError: module 'index_store' has no attribute 'cell_depths'`.

- [ ] **Step 3: Implement**

`engine/index_store.py`. Replace the module docstring's second paragraph ("One inherited constraint is worth stating ...") with:

```python
One convention is worth stating. A reader document is a version, and its id is
`<spec id>@<version>`, which is also the head of every locator into it. Two
versions of one specification are two documents.
```

Replace the document construction inside `documents`:

```python
    out = []
    for version in versions:
        spec = specs[version["spec_id"]]
        lab = labs[spec["lab_id"]]
        document = {
            "id": f"{spec['id']}@{version['version']}",
            "lab": lab["name"],
            "title": spec["title"],
            "shortTitle": spec["short_title"],
            "version": version["version"],
        }
        if version["source_url"]:
            document["sourceUrl"] = version["source_url"]
        document["markdown"] = version["markdown"]
        out.append(document)
    return sorted(out, key=lambda d: d["id"])
```

and its docstring's second paragraph with:

```python
    Ordered by document id, `<spec id>@<version>`.
```

Add after `runlog_rows`:

```python
def cell_depths(store, cells):
    """The depth of each cell a publication carries, from its own run.

    {(behaviour_slug, spec_version_id): {"mean": float, "judges": {model: {"depth",
    "rationale"}}}}. A cell any of whose done calls has no done depth is left out:
    the caller decides whether that refuses a publication."""
    wanted = {(c["run_id"], c["behaviour_slug"], c["spec_version_id"]) for c in cells}
    calls = [c for c in _rows(store, "aci_judge_calls")
             if (c["run_id"], c["behaviour_slug"], c["spec_version_id"]) in wanted
             and c["status"] == "done"]
    depths = {d["call_id"]: d for d in _rows(store, "aci_depths")}

    by_cell = {}
    for call in calls:
        by_cell.setdefault((call["behaviour_slug"], call["spec_version_id"]), []).append(call)

    out = {}
    for key, cell in by_cell.items():
        given = [depths.get(call["id"]) for call in cell]
        if any(d is None or d["status"] != "done" for d in given):
            continue
        judges = {call["model"]: {"depth": d["depth"], "rationale": d.get("rationale") or ""}
                  for call, d in zip(cell, given)}
        out[key] = {"mean": round(sum(j["depth"] for j in judges.values()) / len(judges), 1),
                    "judges": dict(sorted(judges.items()))}
    return out
```

- [ ] **Step 4: Run the tests**

Run: `python3 engine/test_index_store.py`
Expected: `OK`.

- [ ] **Step 5: Commit**

```bash
git add engine/index_store.py engine/test_index_store.py
git commit -m "feat: a reader document is a version, and a cell carries its judged depth" -m "Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Hc7ZTy4wQ8UubJaH4UuRxE"
```

---

### Task 8: The payload builder: every behaviour, keyed by document, with depth

**Files:**
- Modify: `engine/panel/build_site_data.py`
- Create: `engine/panel/test_build_site_data.py`
- Modify: `.github/workflows/ci.yml`

**Interfaces:**
- Consumes: `index_store.cell_depths`, `index_store.documents` ids (Task 7); `harness.passages(spec, version)` (Task 2).
- Produces: `build_site_data.display_behaviours(keep, registry) -> [{"slug","name","definition","category"}]` ordered by `(category, name)`; `build_site_data.build_behaviours(behaviours, votes, text, document_ids, depths, panel, display) -> [behaviour]` with `coverage[document_id] = {"depth": depth | None, "passages": [...]}`.

- [ ] **Step 1: Write the failing tests**

`engine/panel/test_build_site_data.py`:

```python
"""The behaviour payload: which behaviours, filed under which document, carrying
what. The database is not touched: the pure functions main() composes are."""
import importlib.util
import sys
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
_spec = importlib.util.spec_from_file_location("build_site_data", HERE / "build_site_data.py")
bs = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(bs)

REGISTRY = {
    "b": {"name": "Bravo", "group": "G1", "definition": "d", "set": "user"},
    "a": {"name": "Alpha", "group": "G2", "definition": "d", "set": "index"},
    "c": {"name": "Charlie", "group": "G1", "definition": "d", "set": "reader-test"},
}
PANEL = {"sol", "fable", "deepseek"}
DISPLAY = {"threshold": 1, "solid_threshold": 6}
OLD = "openai--model-spec@2025-12-18"
NEW = "openai--model-spec@2026-08-18"
BRAVO = [{"slug": "b", "name": "Bravo", "definition": "d", "category": "G1"}]
VOTES = {("b", f"{OLD} > #x > ¶1"): {"sol": 2, "fable": 2, "deepseek": 2},
         ("b", f"{NEW} > #x > ¶1"): {"sol": 3, "fable": 2, "deepseek": 2}}
TEXT = {locator: "Quoted." for _slug, locator in VOTES}


class DisplayTest(unittest.TestCase):
    def test_every_set_is_displayed_ordered_by_group_then_name(self):
        rows = bs.display_behaviours(["a", "b", "c"], REGISTRY)
        self.assertEqual([row["slug"] for row in rows], ["b", "c", "a"])

    def test_a_slug_the_registry_does_not_carry_is_refused(self):
        with self.assertRaises(SystemExit):
            bs.display_behaviours(["b", "nope"], REGISTRY)


class BuildTest(unittest.TestCase):
    def build(self, depths=None):
        [row] = bs.build_behaviours(BRAVO, VOTES, TEXT, [OLD, NEW], depths or {}, PANEL, DISPLAY)
        return row

    def test_a_passage_is_filed_under_the_document_its_locator_names(self):
        row = self.build()
        self.assertEqual([len(row["coverage"][d]["passages"]) for d in (OLD, NEW)], [1, 1])
        self.assertTrue(row["coverage"][NEW]["passages"][0]["locator"].startswith(NEW))

    def test_a_cell_carries_its_depth_and_nothing_a_human_wrote(self):
        depth = {"mean": 2.7, "judges": {"sol": {"depth": 3, "rationale": "r"}}}
        row = self.build({("b", OLD): depth})
        self.assertEqual(row["coverage"][OLD], {"depth": depth,
                                               "passages": row["coverage"][OLD]["passages"]})
        self.assertIsNone(row["coverage"][NEW]["depth"])

    def test_the_strict_variant_is_not_fed_by_another_behaviour(self):
        self.assertFalse(hasattr(bs, "SLUGS_EXTRA"))


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Run it to watch it fail**

Run: `python3 engine/panel/test_build_site_data.py`
Expected: `TypeError: display_behaviours() missing 1 required positional argument` and `AttributeError: ... 'build_behaviours'`.

- [ ] **Step 3: Implement**

`engine/panel/build_site_data.py`.

Replace the docstring paragraph beginning "Behaviour identity" with:

```python
Behaviour identity -- name, definition, group -- comes from aci_behaviours, the
only registry there is. Every behaviour a publication selects is shown, whatever
its set; no human verdict is read. A passage is filed under the document its
locator names: the head of a locator, `<spec id>@<version>`, is the document's
id. Each cell carries the depth its run's judges gave it.
```

Delete the `LAB = ...` line and the `SLUGS_EXTRA = ...` line (with its comment). Keep `MODEL_LABEL`, `DATE_RE`, `SUBSTITUTION_NOTES`.

Replace `display_behaviours`:

```python
def display_behaviours(keep, registry):
    """The behaviours a publication shows, ordered as the reader lists them: by
    group, then name. A slug the registry does not carry is refused, so a typo
    cannot build a menu with a hole in it."""
    unknown = [slug for slug in keep if slug not in registry]
    if unknown:
        sys.exit(f"display behaviours not in the behaviour registry: {unknown}")
    rows = [{"slug": slug, "name": registry[slug]["name"],
             "definition": registry[slug]["definition"],
             "category": registry[slug]["group"]}
            for slug in dict.fromkeys(keep)]
    return sorted(rows, key=lambda row: (row["category"], row["name"]))


def build_behaviours(behaviours, votes, text, document_ids, depths, panel, display):
    """The payload's behaviours.

    `votes` is {(slug, locator): {model: verdict}}, `text` {locator: passage text},
    `depths` {(slug, document id): depth}. A passage belongs to the document whose
    id heads its locator."""
    sym = {3: "✓✓", 2: "✓", 1: "~", 0: "✗"}
    word = {3: "defining", 2: "core", 1: "related", 0: "not relevant"}
    out = []
    for b in behaviours:
        cov = {}
        for document_id in document_ids:
            cell = []
            for (slug, locator), mv in votes.items():
                if slug != b["slug"] or locator.split(" > ", 1)[0] != document_id:
                    continue
                if "fable" in mv and "opus" in mv:
                    mv = {m: v for m, v in mv.items() if m != "opus"}   # opus is fable's SUBSTITUTE, never an extra seat
                if "kimi" in mv and "kimi-k2" in mv:
                    mv = {m: v for m, v in mv.items() if m != "kimi-k2"}   # k2.6 is kimi's stand-in; k3 wins when present
                cell.append((locator, mv))
            max_verdict = max([2] + [v for _, mv in cell for v in mv.values()])
            cits = []
            for locator, mv in cell:
                score = sum(mv.values())
                if not keeps_citation(score, len(mv), len(panel), display["threshold"]):
                    continue
                decisions = "\n".join(f"{sym[v]} {MODEL_LABEL.get(m, m)} — {word[v]}"
                                      for m, v in sorted(mv.items(), key=lambda x: -x[1]))
                quote, is_example = citation_quote(text.get(locator, ""))
                cits.append({
                    "id": f"{document_id}-{b['slug']}-panel-{len(cits) + 1}",
                    "locator": locator, "quote": quote, "exampleBlock": is_example,
                    "role": f"Model determined relevance (score {score}/{max_verdict * len(mv)}):\n{decisions}",
                    "adjacent": score < display["solid_threshold"],
                    "verdicts": dict(sorted(mv.items())), "score": score,
                })
            cits.sort(key=lambda c: (-c["score"], c["locator"]))
            cov[document_id] = {"depth": depths.get((b["slug"], document_id)), "passages": cits}
        out.append({"id": len(out) + 1, "slug": b["slug"], "name": b["name"],
                    "definition": b["definition"], "category": b["category"],
                    "coverage": cov})
    return out
```

In `main`, replace everything from `log_rows = index_store.published_runlog_rows(store, cells=cells)` through the end of the `for b in behaviours:` loop (the line `"coverage": cov})`) with:

```python
    if cells is None:
        publication = index_store.current_publication(store)
        cells = [c for c in store.select("aci_publication_cells")
                 if publication and c["publication_id"] == publication["id"]]
    log_rows = index_store.published_runlog_rows(store, cells=cells)
    votes = collections.defaultdict(dict)
    runlog_models = set()
    runlog_rubrics = set()
    runlog_keys = set()
    max_verdict = 0   # scale of the admitted rows; names the scoring rule in provenance
    for d in log_rows:
        runlog_keys.add(d["behaviour"])
        runlog_models.add(d["model"])   # pre-filter, so a zero can name them
        runlog_rubrics.add(d.get("rubric", "v1"))
        if d.get("rubric", "v1") != rubric or not d.get("parsed", True) or d["model"] not in panel:
            continue
        votes[(d["behaviour"], d["locator"])][d["model"]] = d.get("verdict", 0)
        max_verdict = max(max_verdict, d.get("verdict", 0))
    unknown_keys = sorted(runlog_keys - set(registry))
    if unknown_keys:
        sys.exit(unknown_slug_message(unknown_keys, registry_path))

    # One document per published version; its id heads every locator into it.
    versions = {v["id"]: v for v in store.select("aci_spec_versions")}
    published = [versions[i] for i in index_store.published_spec_version_ids(store, cells=cells)]
    document_ids = [f"{v['spec_id']}@{v['version']}" for v in published]
    text = {}
    for version in published:
        for loc, _sec, t in h.passages(version["spec_id"], version["version"]):
            text[loc] = t
    depths = {(slug, f"{versions[version_id]['spec_id']}@{versions[version_id]['version']}"): depth
              for (slug, version_id), depth in index_store.cell_depths(store, cells).items()}

    behaviours = display_behaviours(DISPLAY["behaviours"], registry)
    out_behaviours = build_behaviours(behaviours, votes, text, document_ids, depths,
                                      panel, DISPLAY)
```

In the provenance dict, replace the `"panel": [...] if DISPLAY["panel"] == "frontier" else sorted(panel),` entry with:

```python
               "panel": sorted(panel),
```

`.github/workflows/ci.yml`, `Panel and citation suites`, add after `python3 engine/panel/test_panel.py`:

```yaml
          python3 engine/panel/test_build_site_data.py
```

- [ ] **Step 4: Run the tests**

Run: `python3 engine/panel/test_build_site_data.py && python3 engine/panel/test_panel.py`
Expected: both `OK`.

- [ ] **Step 5: Commit**

```bash
git add engine/panel/build_site_data.py engine/panel/test_build_site_data.py .github/workflows/ci.yml
git commit -m "feat: the payload shows every selected behaviour, keyed by document, with its depth" -m "No set, no human verdict and no strict variant is read: the curation check, the set filter and SLUGS_EXTRA are gone, and a passage is filed under the document its locator names." -m "Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Hc7ZTy4wQ8UubJaH4UuRxE"
```

---

### Task 9: The documents payload carries documents only

**Files:**
- Modify: `engine/build-spec-reader-data.py`
- Create: `engine/test_build_spec_reader_data.py`
- Modify: `.github/workflows/ci.yml`

**Interfaces:**
- Produces: `documents_payload(store, cells=None) -> {"generatedFrom": [...], "documents": [...]}`.

- [ ] **Step 1: Write the failing test**

`engine/test_build_spec_reader_data.py`:

```python
"""The documents payload: the text of every version a publication carries, and
nothing beside it. Run: python3 engine/test_build_spec_reader_data.py"""
import importlib.util
import sys
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(HERE / "spec-cite"))
import cite                      # noqa: E402

_spec = importlib.util.spec_from_file_location("build_spec_reader_data",
                                               HERE / "build-spec-reader-data.py")
builder = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(builder)


class FakeStore:
    def __init__(self, tables):
        self.tables = tables

    def select(self, table, params=None):
        return self.tables.get(table, [])


STORE = FakeStore({
    "aci_labs": [{"id": "openai", "name": "OpenAI"}],
    "aci_specs": [{"id": "openai--model-spec", "lab_id": "openai", "title": "OpenAI Model Spec",
                   "short_title": "Model Spec", "source_url": "https://example.com",
                   "locator_style": "anchor"}],
    "aci_spec_versions": [
        {"id": f"row-{n}", "spec_id": "openai--model-spec", "version": version,
         "markdown": "# Spec\n\nText.", "content_sha256": f"sha-{n}",
         "source_url": "https://example.com"}
        for n, version in ((1, "2025-12-18"), (2, "2026-08-18"))],
})


class PayloadTest(unittest.TestCase):
    def tearDown(self):
        cite.reset_registry()

    def test_every_published_version_is_a_document_and_nothing_else_is_carried(self):
        cells = [{"behaviour_slug": "b", "spec_version_id": "row-1", "run_id": "r"},
                 {"behaviour_slug": "b", "spec_version_id": "row-2", "run_id": "r"}]
        payload = builder.documents_payload(STORE, cells)
        self.assertEqual(sorted(payload), ["documents", "generatedFrom"])
        self.assertEqual([d["id"] for d in payload["documents"]],
                         ["openai--model-spec@2025-12-18", "openai--model-spec@2026-08-18"])


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Run it to watch it fail**

Run: `python3 engine/test_build_spec_reader_data.py`
Expected: `AttributeError: module 'build_spec_reader_data' has no attribute 'documents_payload'`.

- [ ] **Step 3: Implement**

Replace the whole of `engine/build-spec-reader-data.py` from the line `from coverage_payload import coverage_payload` to the end with:

```python
ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "site" / "spec-reader" / "data" / "documents.json"

sys.path.insert(0, str(ROOT / "engine"))
sys.path.insert(0, str(ROOT / "engine" / "spec-cite"))


def documents_payload(store, cells=None):
    """The reader's documents payload: the text of every version a publication
    carries. The frozen coverage ledger this used to carry beside it is not read by
    the reader, and a publication describes coverage through its judges."""
    import index_store            # noqa: E402
    index_store.install_registry(store)
    return {
        "generatedFrom": ["supabase: aci_spec_versions"],
        "documents": index_store.documents(
            store, index_store.published_spec_version_ids(store, cells=cells)),
    }


def main(argv=None) -> None:
    out = OUTPUT
    cells = None
    for arg in (sys.argv[1:] if argv is None else argv):
        if arg.startswith("--out="):
            out = Path(arg.split("=", 1)[1])
        elif arg.startswith("--cells="):
            cells = json.loads(Path(arg.split("=", 1)[1]).read_text())
        else:
            raise SystemExit(
                f"unknown argument {arg!r} (supported: --out=PATH --cells=PATH)"
            )

    from store import Store       # noqa: E402
    payload = documents_payload(Store.from_env(), cells)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")))
    print(f"Wrote {out.relative_to(ROOT) if out.is_relative_to(ROOT) else out}")


if __name__ == "__main__":
    main()
```

Keep the module docstring and the `from __future__`, `json`, `sys`, `Path` imports above it; update the docstring's first paragraph to:

```python
The payload carries the spec text of every version the current publication used.
It comes from the index tables; there is nowhere else it lives.
```

`.github/workflows/ci.yml`, `Store and index suites`, add:

```yaml
          python3 engine/test_build_spec_reader_data.py
```

- [ ] **Step 4: Run the test**

Run: `python3 engine/test_build_spec_reader_data.py && python3 engine/test_coverage_payload.py`
Expected: both `OK`.

- [ ] **Step 5: Commit**

```bash
git add engine/build-spec-reader-data.py engine/test_build_spec_reader_data.py .github/workflows/ci.yml
git commit -m "feat: the documents payload carries the documents and nothing beside them" -m "Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Hc7ZTy4wQ8UubJaH4UuRxE"
```

---

### Task 10: Publishing by document, with the index's panel and every depth

**Files:**
- Modify: `engine/publish.py`
- Modify: `engine/test_publish.py`
- Modify: `engine/job.py` (`run_publish`)
- Modify: `engine/test_job.py`

**Interfaces:**
- Consumes: `index_store.cell_depths` (Task 7).
- Produces: `publish.document_versions(store, ids)`, `publish.panel_seats(config, name)`, `publish.require_depths(store, cells)`, `publish.build(name, cells, behaviours, run_date=None, panel_name=None)`, `publish.publish(store, behaviours, document_ids, rubric, published_by, notes="", run_date=None, config=None)`. Job params for publish: `{"behaviours", "documents", "rubric", "notes", "created_by"}`.

- [ ] **Step 1: Write the failing tests**

`engine/test_publish.py`. Add `from unittest import mock` to the imports. Delete `NewestVersionTest`. Add before `if __name__`:

```python
class DocumentVersionsTest(unittest.TestCase):
    def test_the_versions_named_are_the_versions_published(self):
        older = {"id": "v0", "spec_id": "constitution", "version": "2025-05-01"}
        chosen = publish.document_versions(store([], [], versions=(V1, older, V2)), ["v0"])
        self.assertEqual(chosen, [older])

    def test_a_version_the_index_does_not_carry_is_named(self):
        with self.assertRaises(SystemExit) as refused:
            publish.document_versions(store([], []), ["v1", "invented"])
        self.assertIn("invented", str(refused.exception))


class PanelTest(unittest.TestCase):
    def test_the_seats_of_a_configured_panel(self):
        self.assertEqual(publish.panel_seats({"panels": {"p": ["sol", "deepseek"]}}, "p"),
                         ["deepseek", "sol"])

    def test_an_unknown_panel_is_refused(self):
        with self.assertRaises(SystemExit):
            publish.panel_seats({"panels": {}}, "nope")


class DepthsTest(unittest.TestCase):
    CELL = {"run_id": "r1", "behaviour_slug": "helpfulness", "spec_version_id": "v1"}

    def store(self, depth_statuses):
        return FakeStore(
            aci_judge_calls=[{"id": f"c-{m}", **calls("r1", "helpfulness", "v1", [m])[0]}
                             for m in PANEL],
            aci_depths=[{"call_id": f"c-{m}", "status": s, "depth": 2, "rationale": ""}
                        for m, s in zip(PANEL, depth_statuses)],
            aci_spec_versions=[V1, V2])

    def test_a_cell_with_every_depth_passes(self):
        publish.require_depths(self.store(["done", "done", "done"]), [self.CELL])

    def test_a_cell_missing_a_depth_is_refused_and_named(self):
        with self.assertRaises(SystemExit) as refused:
            publish.require_depths(self.store(["done", "error", "done"]), [self.CELL])
        self.assertIn("helpfulness x constitution@2026-01-20", str(refused.exception))


class BuildTest(unittest.TestCase):
    def test_the_payload_is_built_for_the_publication_panel(self):
        seen = {}

        def fake_run(argv, capture_output, text):
            seen["argv"] = argv
            out = next(a.split("=", 1)[1] for a in argv if a.startswith("--out="))
            Path(out).write_text("{}")
            return type("Done", (), {"returncode": 0, "stderr": "", "stdout": ""})()

        with mock.patch.object(publish.subprocess, "run", fake_run):
            publish.build("payload", [], ["helpfulness"], panel_name="frontier_fast")
        self.assertIn("--panel=frontier_fast", seen["argv"])
```

`engine/test_job.py`, add to `JobDispatchTest`:

```python
    def test_publish_takes_documents_and_no_panel(self):
        store = FakeStore(aci_specs=[], aci_spec_versions=[])
        seen = {}
        original = job_module.publish_mode
        job_module.publish_mode = type("P", (), {"publish": staticmethod(
            lambda *args: seen.update(args=args) or ({"id": "pub-1"}, []))})
        self.addCleanup(lambda: setattr(job_module, "publish_mode", original))
        job_module.run_publish(store, {"behaviours": ["b"], "documents": ["v-1"],
                                       "created_by": "Polaris Collective"})
        self.assertEqual(seen["args"][1:4], (["b"], ["v-1"], "v5"))
```

- [ ] **Step 2: Run them to watch them fail**

Run: `python3 engine/test_publish.py; python3 engine/test_job.py`
Expected: `AttributeError` on `document_versions`, `panel_seats`, `require_depths`; `build()` rejecting `panel_name`; the job passing a panel.

- [ ] **Step 3: Implement**

`engine/publish.py`. Replace the docstring's usage lines:

```python
    ACI_JOB_ID=<uuid> python3 engine/job.py          # as the portal runs it
    python3 engine/publish.py --behaviours=a,b --documents=<version id>,<version id>
```

and append to the docstring:

```python
The panel is the configuration's display panel, the one the index publishes, and
every cell must also carry a depth from each of its run's judges.
```

Replace `newest_version_per_spec` with:

```python
def document_versions(store, document_ids):
    """The versions a publication carries, as themselves. A document is a version:
    naming an older one publishes the older one."""
    rows = {v["id"]: v for v in store.select("aci_spec_versions")}
    missing = sorted(set(document_ids) - set(rows))
    if missing:
        raise SystemExit(f"not document versions this index carries: {missing}")
    return [rows[i] for i in sorted(set(document_ids))]


def panel_seats(config, name):
    seats = config.get("panels", {}).get(name)
    if not isinstance(seats, list) or not seats:
        raise SystemExit(f"no panel named {name!r} in the judging configuration")
    return sorted(seats)


def require_depths(store, cells):
    """Refuse a publication any of whose cells lacks a depth from every judge of
    its run, naming them all at once."""
    given = index_store.cell_depths(store, cells)
    versions = {v["id"]: v for v in store.select("aci_spec_versions")}
    missing = sorted(
        f"{c['behaviour_slug']} x {versions[c['spec_version_id']]['spec_id']}"
        f"@{versions[c['spec_version_id']]['version']}"
        for c in cells if (c["behaviour_slug"], c["spec_version_id"]) not in given)
    if missing:
        raise SystemExit(
            "these cells have no depth from every judge of their run:\n  "
            + "\n  ".join(missing)
            + "\nRetry the run's failed calls, then build again.")
```

Replace `build`'s signature and extras:

```python
def build(name, cells, behaviours, run_date=None, panel_name=None):
```

```python
        extra = [f"--run-date={run_date}"] if run_date and name == "payload" else []
        if name == "payload":
            extra.append("--behaviours=" + ",".join(sorted(behaviours)))
            if panel_name:
                extra.append(f"--panel={panel_name}")
```

Replace `publish` and `main`:

```python
def publish(store, behaviours, document_ids, rubric, published_by, notes="",
            run_date=None, config=None):
    """The publication row and its cells, written in that order.

    The row first because the cells reference it. Nothing is public: a reader
    following `?publication=` can see it, and nobody else can.
    """
    config = config or json.loads((HERE / "panel" / "panel-config.json").read_text())
    panel_name = config["display"]["panel"]
    panel = panel_seats(config, panel_name)
    versions = document_versions(store, document_ids)
    cells = choose_cells(store, behaviours, versions, panel, rubric)
    require_depths(store, cells)

    payload, payload_sha256 = build("payload", cells, behaviours, run_date, panel_name)
    documents, documents_sha256 = build("documents", cells, behaviours)

    publication = {
        "published_by": published_by,
        "notes": notes,
        "panel": panel,
        "rubric": rubric,
        "is_public": False,
        "build_params": {"behaviours": sorted(behaviours),
                         "documents": sorted(document_ids),
                         "panel": panel_name, "rubric": rubric, "run_date": run_date},
        "payload": payload,
        "payload_sha256": payload_sha256,
        "documents": documents,
        "documents_sha256": documents_sha256,
    }
    [row] = store.insert("aci_publications", [publication], returning=True)
    store.insert("aci_publication_cells",
                 [cell | {"publication_id": row["id"]} for cell in cells])
    return row, cells


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--behaviours", required=True, help="comma-separated slugs")
    parser.add_argument("--documents", required=True,
                        help="comma-separated aci_spec_versions ids")
    parser.add_argument("--rubric", default="v5")
    parser.add_argument("--notes", default="")
    parser.add_argument("--by", default=os.environ.get("USER", "publish.py"))
    parser.add_argument("--run-date", default=None,
                        help="pin provenance.runDate, for a reproducible rebuild")
    args = parser.parse_args(argv)

    store = Store.from_env()
    index_store.install_registry(store)
    row, cells = publish(
        store,
        [s for s in args.behaviours.split(",") if s],
        [s for s in args.documents.split(",") if s],
        args.rubric, args.by, args.notes, args.run_date)
    print(f"published {row['id']} (not public): {len(cells)} cells")
    print(f"  payload   {row['payload_sha256'][:16]}")
    print(f"  documents {row['documents_sha256'][:16]}")
    return 0
```

`engine/job.py`, replace `run_publish`:

```python
def run_publish(store, params):
    index_store.install_registry(store)
    row, cells = publish_mode.publish(
        store, params["behaviours"], params["documents"],
        params.get("rubric", "v5"), params.get("created_by", "admin portal"),
        params.get("notes", ""), params.get("run_date"))
    return {"publication_id": row["id"],
            "detail": f"{len(cells)} cells, not public"}
```

- [ ] **Step 4: Run the tests**

Run: `python3 engine/test_publish.py && python3 engine/test_job.py`
Expected: both `OK`.

- [ ] **Step 5: Commit**

```bash
git add engine/publish.py engine/test_publish.py engine/job.py engine/test_job.py
git commit -m "feat: a publication names its document versions, uses the index panel, and needs every depth" -m "publish.py now passes the panel to the payload builder, which had shown the configured display panel whatever the publication named." -m "Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Hc7ZTy4wQ8UubJaH4UuRxE"
```

---

### Task 11: Reader fixtures, and the MCP answers

**Files:**
- Modify: `tests/fixtures/reader/documents.json`, `tests/fixtures/reader/behaviours.json`
- Modify: `app/lib/mcp-tools.mjs`, `app/lib/__tests__/mcp-tools.test.mjs`
- Modify: `app/api/mcp/route.js`, `site/mcp.html`
- Modify: `engine/verify-reader-test.mjs`, `engine/reader-routes.mjs`

**Interfaces:**
- Produces: fixture documents `acme--corpus@2026-01-01`, `acme--second@2026-02-01` (lab "Acme"); fixture coverage entries `{"depth": {...} | null, "passages": [...]}`; `listBehaviours` coverage entries `{passages, strongest, depth}`; `retrievePassages` result cells carry `depth`; no `comparability` key anywhere.

- [ ] **Step 1: Convert the fixtures**

```bash
cd /Users/sverbo/Desktop/Codes/Polaris/ai-character-index
python3 - <<'EOF'
import json
from pathlib import Path
root = Path("tests/fixtures/reader")
IDS = {"corpus-labs": "acme--corpus@2026-01-01", "second-labs": "acme--second@2026-02-01"}
judge = lambda depth, rationale: {"depth": depth, "rationale": rationale}
DEPTHS = {
    ("defined-behaviour", "acme--corpus@2026-01-01"): {"mean": 2.7, "judges": {
        "a": judge(3, "Rules, no examples."), "b": judge(3, "Rules, no examples."),
        "c": judge(2, "Discussed in general terms.")}},
    ("defined-behaviour", "acme--second@2026-02-01"): {"mean": 1.0, "judges": {
        "a": judge(1, "Named only."), "b": judge(1, "Named only."), "c": judge(1, "Named only.")}},
    ("undefined-behaviour", "acme--corpus@2026-01-01"): {"mean": 4.0, "judges": {
        "a": judge(4, "Rules and worked examples."), "b": judge(4, "Rules and worked examples."),
        "c": judge(4, "Rules and worked examples.")}},
}
documents = json.loads((root / "documents.json").read_text())
for document in documents["documents"]:
    document["id"] = IDS[document["id"]]
    document["lab"] = "Acme"
documents.pop("behaviours", None)
(root / "documents.json").write_text(json.dumps(documents, ensure_ascii=False, separators=(",", ":")))
behaviours = json.loads((root / "behaviours.json").read_text())
for behaviour in behaviours["behaviours"]:
    behaviour["coverage"] = {
        IDS[old]: {"depth": DEPTHS.get((behaviour["slug"], IDS[old])), "passages": cell["passages"]}
        for old, cell in behaviour["coverage"].items()}
(root / "behaviours.json").write_text(json.dumps(behaviours, ensure_ascii=False, indent=1) + "\n")
EOF
```

- [ ] **Step 2: Point the tests and walkers at the new ids**

```bash
sed -i '' -e 's/corpus-labs/acme--corpus@2026-01-01/g' -e 's/second-labs/acme--second@2026-02-01/g' \
  app/lib/__tests__/mcp-tools.test.mjs engine/verify-reader-test.mjs
sed -i '' -e 's/assert.equal(corpus.lab, "Corpus Labs");/assert.equal(corpus.lab, "Acme");/' \
  app/lib/__tests__/mcp-tools.test.mjs
```

In `engine/verify-reader-test.mjs`, every URL that interpolates a document id becomes encoded. Replace the four forms:

```js
`${base}?spec=${document.id}`                                   -> `${base}?spec=${encodeURIComponent(document.id)}`
`${base}?behavior=${behaviour.slug}&spec=${document.id}`        -> `${base}?behavior=${behaviour.slug}&spec=${encodeURIComponent(document.id)}`
`${base}?behavior=${slugs.join(",")}&spec=${document.id}`       -> `${base}?behavior=${slugs.join(",")}&spec=${encodeURIComponent(document.id)}`
`&spec=acme--corpus@2026-01-01`                                 -> `&spec=${encodeURIComponent(documents[0].id)}`
```

and the selector `'.document-panel[data-document-id="acme--corpus@2026-01-01"]'` becomes `` `.document-panel[data-document-id="${documents[0].id}"]` `` passed into `page.evaluate` as an argument:

```js
  const unfocused = await page.evaluate(id => {
    const panel = document.querySelector(`.document-panel[data-document-id="${id}"]`);
    panel.querySelector(".document-focus-toggle").click();
    return panel.querySelectorAll(".section-collapsed").length;
  }, documents[0].id);
```

`engine/reader-routes.mjs`: delete `set: "reader-test",` from both fixture notes. `app/lib/__tests__/mcp-tools.test.mjs`: delete `set: "reader-test",` from both `NOTES` entries.

- [ ] **Step 3: Write the failing MCP tests**

In `app/lib/__tests__/mcp-tools.test.mjs`, replace `list_behaviours summarises coverage per specification`:

```js
test("list_behaviours summarises coverage per specification, depth included", () => {
  const answer = listBehaviours(snapshot());
  const [defined] = answer.behaviours;
  assert.deepEqual(defined.coverage["acme--corpus@2026-01-01"].passages, 2);
  assert.deepEqual(defined.coverage["acme--corpus@2026-01-01"].strongest, "defining");
  assert.equal(defined.coverage["acme--corpus@2026-01-01"].depth.mean, 2.7);
  assert.equal(defined.coverage["acme--second@2026-02-01"].depth.mean, 1.0);
});

test("a cell no depth was given for says null rather than zero", () => {
  const answer = listBehaviours(snapshot());
  const undefinedBehaviour = answer.behaviours.find(b => b.slug === "undefined-behaviour");
  assert.equal(undefinedBehaviour.coverage["acme--second@2026-02-01"].depth, null);
});
```

Replace `a request spanning two specifications carries the comparability note` and `a request naming one specification does not` with:

```js
test("a retrieved cell carries its depth", () => {
  const answer = retrievePassages(snapshot(), {
    behaviours: ["defined-behaviour"], model_spec_ids: ["acme--corpus@2026-01-01"],
  });
  assert.equal(answer.results[0].depth.mean, 2.7);
  assert.equal(answer.results[0].depth.judges.c.depth, 2);
});

test("no answer carries a comparability caveat: every cell is judged by one panel", () => {
  const answer = retrievePassages(snapshot(), { behaviours: ["defined-behaviour"] });
  assert.equal(answer.comparability, undefined);
});
```

Delete the test `the comparability note is on every page of a two specification walk`, and in the two `a repeated ... answers as the unrepeated request does` tests delete their `assert.equal(repeated.comparability, undefined, ...)` lines.

- [ ] **Step 4: Run them to watch them fail**

Run: `node --test app/lib/__tests__/mcp-tools.test.mjs 2>&1 | grep -E "^not ok|ℹ (pass|fail)"`
Expected: `not ok` on the depth tests and the caveat test.

- [ ] **Step 5: Implement**

`app/lib/mcp-tools.mjs`. In `listBehaviours`, replace the coverage entry:

```js
        coverage[modelSpecId] = {
          passages: passages.length,
          strongest: TIERS.find(
            tier => passages.some(passage => passage.band === tier)) || null,
          depth: behaviour.coverage?.[modelSpecId]?.depth ?? null,
        };
```

Delete the comment block and `const COMPARABILITY = ...` (lines "The defect the site hides" through `+ "coverage.";`). In `retrievePassages`, delete the two comment lines and the `...(modelSpecIds.length > 1 ? { comparability: COMPARABILITY } : {}),` line, and replace the result mapping:

```js
    results: page.map(cell => ({
      behaviour: cell.slug,
      model_spec_id: cell.modelSpecId,
      depth: behaviourBySlug.get(cell.slug).coverage?.[cell.modelSpecId]?.depth ?? null,
      passages: cell.passages.map(shapePassage),
      ...(cell.passages.length ? {} : { note: NO_COVERAGE }),
    })),
```

`app/api/mcp/route.js`, in the `retrieve_passages` description, replace the last three concatenated strings (from `+ "across pages. Passage counts are NOT comparable between laboratories: "`) with:

```js
        + "across pages. Each pair carries the depth the panel gave it, 0 to 4.",
```

`site/mcp.html`, replace the `model_spec_ids` list item:

```html
      <li><b>model_spec_ids.</b> Optional, every specification by default. Each behaviour and
          specification pair comes back with its depth, the mean of what each judge gave on a
          scale from 0, absent, to 4, rules with worked examples.</li>
```

- [ ] **Step 6: Run the suites and the reader walkers**

Run:
```bash
node --test app/lib/__tests__/*.test.mjs 2>&1 | grep -E "^not ok|ℹ (pass|fail)"
node engine/verify-reader-test.mjs | tail -3
node engine/verify-reader-features.mjs | tail -3
```
Expected: `ℹ fail 0`; `All views verified.`; the features walker ending without failures.

- [ ] **Step 7: Commit**

```bash
git add tests/fixtures/reader app/lib/mcp-tools.mjs app/lib/__tests__/mcp-tools.test.mjs app/api/mcp/route.js site/mcp.html engine/verify-reader-test.mjs engine/reader-routes.mjs
git commit -m "feat: the MCP answers carry each cell's depth, and no comparability caveat" -m "Every cell of a publication is judged by one panel now, so the caveat its own comment asked to be removed goes. The reader fixtures name documents as versions of one lab, and carry depths." -m "Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Hc7ZTy4wQ8UubJaH4UuRxE"
```

---

### Task 12: Depth beside each behaviour in the reader

**Files:**
- Modify: `site/spec-reader/app.js` (`renderBehaviourList`, `rebuildReader`, new `updateBehaviourDepths`)
- Modify: `site/spec-reader/styles.css`
- Modify: `engine/verify-reader-test.mjs`

**Interfaces:**
- Consumes: fixture coverage `depth` (Task 11).
- Produces: each menu row carries `<span class="depth" data-behaviour-depth="<slug>">`, reading the mean for each visible document (`2.7`, `–` when none), joined by ` / ` in compare mode.

- [ ] **Step 1: Write the failing walker check**

In `engine/verify-reader-test.mjs`, inside the `else` branch, directly before `// Several behaviours read over the same text.`, add:

```js
  // Depth beside each behaviour: the panel's mean for the document on screen, a
  // dash where no depth was given. A dash and a zero are different claims.
  for (const behaviour of behaviours) {
    for (const document of documents) {
      await readView(`${base}?behavior=${behaviour.slug}&spec=${encodeURIComponent(document.id)}`);
      const shown = await page.$eval(`[data-behaviour-depth="${behaviour.slug}"]`,
                                     cell => cell.textContent);
      const depth = behaviour.coverage[document.id]?.depth;
      const expected = depth ? depth.mean.toFixed(1) : "–";
      report(shown === expected, `${behaviour.slug} · ${document.id} · depth`,
             `${shown} (expected ${expected})`);
    }
  }
```

- [ ] **Step 2: Run it to watch it fail**

Run: `node engine/verify-reader-test.mjs | grep depth`
Expected: the walker throws `Failed to find element matching selector "[data-behaviour-depth=...]"`.

- [ ] **Step 3: Implement**

`site/spec-reader/app.js`. In `renderBehaviourList`, after `<span class="name">${escapeHTML(behaviour.name)}</span>` add:

```js
              <span class="depth" data-behaviour-depth="${escapeHTML(behaviour.slug)}"></span>
```

and after `updateBehaviourCount();` at the end of the function add:

```js
  updateBehaviourDepths();
```

Add after `renderBehaviourList`:

```js
/* How deeply each document on screen covers each behaviour, beside its name.
 *
 * The mean of the panel's depths on the 0 to 4 scale, one figure per document on
 * screen, so comparing two documents puts two figures side by side. A cell with
 * no depth shows a dash: zero is a finding, a dash is the absence of one. */
const DEPTH_WORDS = ["absent", "named", "discussed", "prescribed", "demonstrated"];

function updateBehaviourDepths() {
  if (!state.payload) return;
  const shown = visibleDocuments().filter(Boolean);
  elements.behaviourList.querySelectorAll("[data-behaviour-depth]").forEach(cell => {
    const behaviour = payloadBehaviours().find(b => b.slug === cell.dataset.behaviourDepth);
    const depths = shown.map(doc => behaviour?.coverage?.[doc.id]?.depth ?? null);
    cell.textContent = depths.map(depth => (depth ? depth.mean.toFixed(1) : "–")).join(" / ");
    cell.title = shown.map((doc, i) => {
      const depth = depths[i];
      if (!depth) return `${doc.title} ${doc.version}: no depth given`;
      const judges = Object.entries(depth.judges || {})
        .map(([judge, given]) => `${judge} ${given.depth}`).join(", ");
      return `${doc.title} ${doc.version}: depth ${depth.mean.toFixed(1)} of 4, `
        + `${DEPTH_WORDS[Math.round(depth.mean)]} (${judges})`;
    }).join("\n");
  });
}
```

In `rebuildReader`, after `applyHighlights();` add:

```js
  updateBehaviourDepths();
```

`site/spec-reader/styles.css`, after the `.behaviour-option .name { ... }` rule add:

```css
/* A behaviour's depth on the documents on screen: a figure, so mono, and quiet
   beside the name it qualifies. */
.behaviour-option .depth {
  flex: none;
  color: var(--faint);
  font-family: var(--mono);
  font-size: 11px;
  font-variant-numeric: tabular-nums;
}
```

- [ ] **Step 4: Run the walkers and the app.js harnesses**

Run:
```bash
node engine/verify-reader-test.mjs | tail -3
node engine/verify-reader-features.mjs | tail -3
for t in engine/panel/test_appjs_*.js engine/panel/test_reader_v5_labels.js; do node $t | tail -1; done
node --test app/lib/__tests__/bands.test.mjs 2>&1 | grep -E "ℹ fail"
```
Expected: `All views verified.`, the features walker passing, every harness passing, `ℹ fail 0`.

- [ ] **Step 5: Commit**

```bash
git add site/spec-reader/app.js site/spec-reader/styles.css engine/verify-reader-test.mjs
git commit -m "feat: the reader shows each behaviour's depth on the documents on screen" -m "Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Hc7ZTy4wQ8UubJaH4UuRxE"
```

---

### Task 13: The portal: documents, one panel, no sets

**Files:**
- Create: `app/lib/documents.mjs`, `app/lib/__tests__/documents.test.mjs`
- Modify: `app/lib/runs.mjs`, `app/lib/__tests__/runs.test.mjs`
- Modify: `app/lib/admin-data.mjs`
- Modify: `app/lib/behaviours.mjs`, `app/lib/__tests__/behaviours.test.mjs`
- Modify: `app/admin/runs/page.jsx`, `app/api/admin/runs/route.js`
- Modify: `app/admin/publications/page.jsx`, `app/api/admin/publications/route.js`
- Modify: `app/admin/specifications/page.jsx`, `app/api/admin/specifications/route.js`
- Modify: `app/admin/behaviours/page.jsx`, `app/api/admin/behaviours/route.js`
- Modify: `engine/verify-portal.mjs`

**Interfaces:**
- Consumes: job params from Tasks 5 and 10; `aci_depths` (Task 1).
- Produces: `documents.mjs`: `specificationId(lab, name)`, `nameProblem(name)`, `versionProblem(version)`, `documentChoices(specs)`; `runs.mjs`: `mergeCounts(...tallies)`; `admin-data.mjs`: `displayPanel() -> {name, seats}`, `runs()` rows gain `depths` (count) and `depth_status` (tally).

- [ ] **Step 1: Write the failing library tests**

`app/lib/__tests__/documents.test.mjs`:

```js
/**
 * What a document is called, and how a form lists them.
 * Run: node --test app/lib/__tests__/documents.test.mjs
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { documentChoices, labelTaken, nameProblem, specificationId, versionProblem }
  from "../documents.mjs";

test("a label a document already carries is refused, since the label is in its id", () => {
  const versions = [{ spec_id: "openai--model-spec", version: "2026-08-18" }];
  assert.match(labelTaken(versions, "openai--model-spec", "2026-08-18"), /already registered/);
  assert.equal(labelTaken(versions, "openai--model-spec", "2026-09-01"), null);
  assert.equal(labelTaken(versions, "alibaba--model-spec", "2026-08-18"), null);
});

test("a document dated only to the month is a label like any other", () => {
  assert.equal(versionProblem("2026-04-00"), null);
});

test("a specification is named by its lab, a double hyphen, and its name", () => {
  assert.equal(specificationId("openai", "model-spec"), "openai--model-spec");
});

test("a document name is lowercase words joined by single hyphens", () => {
  assert.equal(nameProblem("model-spec"), null);
  assert.match(nameProblem("model--spec"), /single hyphens/);
  assert.match(nameProblem("Model Spec"), /single hyphens/);
  assert.match(nameProblem("spec-v2"), /single hyphens/, "the citation grammar has no digits");
  assert.match(nameProblem(""), /required/);
});

test("a version is the release date", () => {
  assert.equal(versionProblem("2026-08-18"), null);
  assert.match(versionProblem("v3"), /2026-08-18/);
  assert.match(versionProblem(""), /required/);
});

test("every version is its own document in a form", () => {
  const specs = [{ title: "OpenAI Model Spec", versions: [
    { id: "v-new", version: "2026-08-18" }, { id: "v-old", version: "2025-12-18" }] }];
  assert.deepEqual(documentChoices(specs), [
    { value: "v-new", label: "OpenAI Model Spec 2026-08-18" },
    { value: "v-old", label: "OpenAI Model Spec 2025-12-18" },
  ]);
});
```

`app/lib/__tests__/runs.test.mjs`: change the import to `import { launchRefusal, mergeCounts } from "../runs.mjs";` and add:

```js
test("a run's work is its passage calls and its depths, counted as one", () => {
  assert.deepEqual(mergeCounts({ done: 6 }, { done: 4, pending: 2 }), { done: 10, pending: 2 });
});

test("a done run whose depths are not all given can be launched again", () => {
  assert.equal(launchRefusal({ status: "done" }, mergeCounts({ done: 6 }, { error: 1, done: 5 })), null);
});
```

`app/lib/__tests__/behaviours.test.mjs`: replace the test `no set is named: every set comes back, keyed by slug`'s last assertion `assert.equal(notes["in-the-reader-set"].set, "reader-test");` with:

```js
  assert.equal(notes["in-the-reader-set"].set, undefined, "a note names no set");
```

- [ ] **Step 2: Run them to watch them fail**

Run: `node --test app/lib/__tests__/documents.test.mjs app/lib/__tests__/runs.test.mjs app/lib/__tests__/behaviours.test.mjs 2>&1 | grep -E "^not ok|ERR_MODULE|ℹ fail"`
Expected: `ERR_MODULE_NOT_FOUND` for `documents.mjs`, `mergeCounts` not exported, and the set assertion failing.

- [ ] **Step 3: Implement the libraries**

`app/lib/documents.mjs`:

```js
/**
 * What a document is called, and how a form lists them.
 *
 * A document is a version of a specification. A specification's id is
 * `<lab>--<name>`: the double hyphen splits the lab from a name that may carry
 * single hyphens, and a document's id is that followed by `@<version>`, the head
 * of every locator into it. The citation grammar reads a specification name as
 * [a-z-]+ and a version as a date, so those are what a name and a version may be.
 */
const NAME = /^[a-z]+(-[a-z]+)*$/;
const VERSION = /^\d{4}-\d{2}-\d{2}$/;

export function specificationId(lab, name) {
  return `${lab}--${name}`;
}

export function nameProblem(name) {
  if (!name) return "the document name is required";
  if (!NAME.test(name)) {
    return "the document name must be lowercase words joined by single hyphens, "
         + "such as model-spec: a citation reads it as letters and hyphens";
  }
  return null;
}

export function versionProblem(version) {
  if (!version) return "the version is required";
  if (!VERSION.test(version)) {
    return "the version must be the release date, written 2026-08-18: a citation reads it as a date";
  }
  return null;
}

/** Why a label cannot be registered for a document, or null.
 *
 * The label is part of the document's id, so a second text under the same label
 * would share the first one's id; the table's unique key is on the digest only.
 * A corrected text is a new version with a label of its own. */
export function labelTaken(versions, specId, version) {
  return versions.some(row => row.spec_id === specId && row.version === version)
    ? `${specId}@${version} is already registered. A document is a version and its `
      + "label is part of its id, so a corrected text needs a label of its own."
    : null;
}

/** Every version as its own document, in the order the specifications list them. */
export function documentChoices(specs) {
  return specs.flatMap(spec => spec.versions.map(version => ({
    value: version.id,
    label: `${spec.title} ${version.version}`,
  })));
}
```

`app/lib/runs.mjs`, add after `unfinished`:

```js
/** Tallies as one: a run's work is its passage calls and its depths. */
export function mergeCounts(...tallies) {
  return tallies.reduce((total, tally) => {
    for (const [status, count] of Object.entries(tally || {})) {
      total[status] = (total[status] || 0) + count;
    }
    return total;
  }, {});
}
```

`app/lib/behaviours.mjs`: change `const SELECT = "slug,name,set_name,numeric_id,group_name,definition,judging";` to `const SELECT = "slug,name,numeric_id,group_name,definition,judging";`, delete the line `set: row.set_name,`, and in `behaviourNotes`' docstring replace "and no set is named here" with "and nothing is filtered by set".

`app/lib/admin-data.mjs`:

Delete the `BEHAVIOUR_SETS` export and its comment.

In `behaviours`, change the order clause to `+ "&order=group_name.asc,name.asc"` and remove `set_name,` from its select.

Replace `runs`:

```js
/** Runs, newest first, each with its calls and its depths counted by status. */
export async function runs(limit = 25, fetchImpl = fetch) {
  const [rows, calls, depths] = await Promise.all([
    select("aci_runs",
           "select=id,created_at,created_by,status,rubric,panel,estimated_usd,cost_usd,"
           + "error,started_at,finished_at&order=created_at.desc"
           + `&limit=${limit}`, fetchImpl),
    select("aci_judge_calls", "select=id,run_id,status", fetchImpl),
    select("aci_depths", "select=call_id,status", fetchImpl),
  ]);
  return rows.map(run => {
    const mine = calls.filter(call => call.run_id === run.id);
    const ids = new Set(mine.map(call => call.id));
    const theirDepths = depths.filter(depth => ids.has(depth.call_id));
    return { ...run, calls: mine.length, by_status: byStatus(mine),
             depths: theirDepths.length, depth_status: byStatus(theirDepths) };
  });
}
```

Add after `panels()`:

```js
/** The one panel the index composes and publishes with: `display.panel`. */
export function displayPanel() {
  const name = panelConfig.display.panel;
  return { name, seats: [...panelConfig.panels[name]].sort() };
}
```

- [ ] **Step 4: Run the library tests**

Run: `node --test app/lib/__tests__/*.test.mjs 2>&1 | grep -E "^not ok|ℹ (pass|fail)"`
Expected: `ℹ fail 0`.

- [ ] **Step 5: Write the failing walker checks**

`engine/verify-portal.mjs`. Replace the `FORMS` entries:

```js
const FORMS = [
  ["/admin/behaviours", "/api/admin/behaviours",
   ["slug", "name", "group", "query", "boundary", "source", "definition", "credit"]],
  ["/admin/specifications", "/api/admin/specifications",
   ["lab", "name", "version", "source_url", "markdown", "title", "short_title",
    "locator_style"]],
  ["/admin/runs", "/api/admin/runs",
   ["verb", "behaviours", "documents", "rubric", "again", "credit"]],
  ["/admin/publications", "/api/admin/publications",
   ["verb", "behaviours", "documents", "rubric", "notes"]],
];
```

Replace the block from `// The defaults an operator is likeliest to leave as they are.` through the rubric `check(...)` with:

```js
// What the forms no longer offer. The index publishes one panel, so no form
// chooses judges; sets decide nothing, so none asks for one; and the judging job
// composes v5 only.
const offered = async (path, selector) => {
  await open(path);
  return page.$$eval(selector, nodes => nodes.length);
};
check(await offered("/admin/behaviours", "form.panel [name=set]") === 0,
      "a behaviour is registered with no set", "");
check(await offered("/admin/runs", "form.panel [name=panel]") === 0
        && await offered("/admin/publications", "form.panel [name=panel]") === 0,
      "no form offers a panel", "");
await open("/admin/runs");
const rubrics = await page.$$eval("form.panel [name=rubric]", nodes => nodes.map(node => node.value));
check(rubrics.length > 0 && rubrics.every(rubric => rubric === "v5"),
      "a run can only be composed with the rubric the job judges",
      rubrics.join(", "));
```

- [ ] **Step 6: Run the walker against a dev server to watch it fail**

Run:
```bash
(pnpm dev --port 3100 > /tmp/aci-dev.log 2>&1 &) ; for i in $(seq 1 60); do curl -s -o /dev/null -w "%{http_code}" http://localhost:3100/admin | grep -q 200 && break; sleep 3; done
node engine/verify-portal.mjs http://localhost:3100 | grep -E "^FAIL"
```
Expected: `FAIL` on the forms (missing `documents`, `name`, `credit`) and on "no form offers a panel".

- [ ] **Step 7: Implement the Runs page and route**

`app/admin/runs/page.jsx`. Change the imports:

```jsx
import { behaviours, displayPanel, jobs, runs, specifications } from "../../lib/admin-data.mjs";
import { documentChoices } from "../../lib/documents.mjs";
import { launchRefusal, mergeCounts } from "../../lib/runs.mjs";
```

Replace the `Promise.all` line:

```jsx
  const [rows, behaviourRows, specs, jobRows] = await Promise.all([
    runs(25), behaviours(), specifications(), jobs(10),
  ]);
  const panel = displayPanel();
```

In the row, replace the `done` and `failed` constants:

```jsx
                const done = run.by_status.done || 0;
                const failed = (run.by_status.error || 0) + (run.depth_status.error || 0);
                const work = mergeCounts(run.by_status, run.depth_status);
```

In the Done cell, after `{done}/{run.calls}` add:

```jsx
                      {run.depths > 0 && (
                        <>
                          <br />
                          <span className="mono">depth {run.depth_status.done || 0}/{run.depths}</span>
                        </>
                      )}
```

Replace `launchRefusal(run, run.by_status) === null` with `launchRefusal(run, work) === null`.

Replace the `Documents` `Choices` and the whole `Panel` `<label>`:

```jsx
          <Choices
            name="documents"
            legend="Documents"
            hint="Each version is its own document, judged as itself."
            options={documentChoices(specs)}
          />
          <p className="why" style={{ margin: "0 0 14px" }}>
            Judged by {panel.seats.join(", ")} ({panel.name}), the one panel the index
            publishes. One call per judge per cell, and a depth from each.
          </p>
```

`app/api/admin/runs/route.js`. Change the import to `import { byStatus, launchRefusal, mergeCounts, unfinished } from "../../../lib/runs.mjs";`. Replace the compose branch:

```js
  if (verb === "compose") {
    const behaviours = fields.many("behaviours");
    const documents = fields.many("documents");
    const rubric = fields.one("rubric") || "v5";
    const again = fields.on("again");
    if (!behaviours.length) refuse("choose at least one behaviour");
    if (!documents.length) refuse("choose at least one document");
    // Who the verdicts are credited to, which a publication reads back when it
    // builds its own citation. An address identifies the operator; it does not
    // read as an author, so the form asks for a name and falls back to the
    // address rather than inventing one.
    const credit = fields.one("credit") || email;
    const job = await startJob("compose",
                               { behaviours, documents, rubric, again, created_by: credit },
                               email);
    return `Composing: ${behaviours.length} behaviours x ${documents.length} documents`
         + `${again ? ", judging again what is already judged" : ""}. `
         + `Nothing is spent yet -- the job writes the calls, their depths and `
         + `their price, and the run appears here with a launch control. `
         + `Job ${job.id.slice(0, 8)}, ${job.origin}.`;
  }
```

In the launch branch, replace the `Promise.all` and `counts`:

```js
    const [[run], calls] = await Promise.all([
      select("aci_runs", `select=id,status,estimated_usd&id=eq.${runId}`),
      select("aci_judge_calls", `select=id,status&run_id=eq.${runId}`),
    ]);
    const depths = calls.length
      ? await select("aci_depths", `select=status&call_id=in.(${calls.map(c => c.id).join(",")})`)
      : [];
    const counts = mergeCounts(byStatus(calls), byStatus(depths));
```

- [ ] **Step 8: Implement the Publications page and route**

`app/admin/publications/page.jsx`. Change the imports and reads:

```jsx
import { behaviours, displayPanel, publications, specifications } from "../../lib/admin-data.mjs";
import { documentChoices } from "../../lib/documents.mjs";
import { Choices, Outcome, When } from "../parts.jsx";

export default async function Publications({ searchParams }) {
  const params = await searchParams;
  const [rows, behaviourRows, specs] = await Promise.all([
    publications(), behaviours(), specifications(),
  ]);
  const panel = displayPanel();
```

Delete the line `const seats = [...new Set(panelRows.flatMap(panel => panel.seats))].sort();`. Replace the build section's `why` paragraph and form body (from `<Choices name="specs"` through the `Rubric` label) with:

```jsx
          <Choices
            name="documents"
            legend="Documents"
            options={documentChoices(specs)}
            hint="Each version is its own document."
          />
          <input type="hidden" name="rubric" value="v5" />
```

and the `why` paragraph with:

```jsx
        <p className="why">
          Every cell must have been judged by {panel.seats.join(", ")} ({panel.name}),
          all of them done, in one run, with a depth from each. That is the claim the
          index sells: a verdict on one document and a verdict on another were reached
          the same way. It is refused here and again by the database. The build is
          written as a draft, and making it public is the next decision.
        </p>
```

`app/api/admin/publications/route.js`, replace the build branch:

```js
  if (verb === "build") {
    const behaviours = fields.many("behaviours");
    const documents = fields.many("documents");
    const rubric = fields.one("rubric") || "v5";
    const notes = fields.one("notes");
    if (!behaviours.length) refuse("choose at least one behaviour");
    if (!documents.length) refuse("choose at least one document");
    const job = await startJob("publish", {
      behaviours, documents, rubric, notes, created_by: email,
    }, email);
    return `Building. Every cell must have been judged by the index's panel under `
         + `rubric ${rubric}, in one run, with a depth from each judge; the job refuses `
         + `and names the cells that were not. It is written as a draft. `
         + `Job ${job.id.slice(0, 8)}, ${job.origin}.`;
  }
```

- [ ] **Step 9: Implement the Specifications page and route**

`app/admin/specifications/page.jsx`. Replace the form's fields before the `<fieldset>` (the `Document id`, `Version label`, `Source url`, `Markdown` labels) with:

```jsx
          <label>
            <span>Lab</span>
            <select name="lab" defaultValue="" required>
              <option value="">Choose the lab that publishes it</option>
              {labRows.map(lab => <option key={lab.id} value={lab.id}>{lab.name}</option>)}
            </select>
            <span className="hint">
              A lab missing from this list is added by a migration in
              polaris-supabase, not here.
            </span>
          </label>
          <label>
            <span>Document name</span>
            <input type="text" name="name" required placeholder="model-spec" list="known-names" />
            <datalist id="known-names">
              {[...new Set(specs.map(spec => spec.id.split("--")[1]).filter(Boolean))]
                .map(name => <option key={name} value={name} />)}
            </datalist>
            <span className="hint">
              Lowercase words joined by hyphens. With the lab it names the document,
              openai--model-spec; the name of a document the index carries adds a version to it.
            </span>
          </label>
          <label>
            <span>Version</span>
            <input type="text" name="version" required placeholder="2026-08-18" />
            <span className="hint">The release date, year first: a citation reads it as a date.</span>
          </label>
          <label>
            <span>Source url</span>
            <input type="url" name="source_url" required
                   placeholder="https://example.com/spec" />
          </label>
          <label>
            <span>Markdown</span>
            <textarea name="markdown" required style={{ minHeight: 200 }} />
            <span className="hint">
              The document itself. Its digest identifies the version, so the same
              bytes cannot be registered twice under two labels.
            </span>
          </label>
```

and delete the `Lab` `<label>` inside the `<fieldset>`. Change the section's `why` paragraph to:

```jsx
        <p className="why">
          A document is named by its lab and its name, and each version is a document
          of its own. Registering a name the index already carries adds a version to it.
        </p>
```

`app/api/admin/specifications/route.js`. Add `import { labelTaken, nameProblem, specificationId, versionProblem } from "../../../lib/documents.mjs";` and replace the body up to `const spec = specs.find(...)` with:

```js
export const POST = formRoute("/admin/specifications", requireOperator, async (fields, email) => {
  const lab = fields.one("lab");
  const name = fields.one("name");
  const version = fields.one("version");
  const markdown = fields.raw("markdown");
  const sourceUrl = fields.one("source_url");
  const title = fields.one("title");
  const shortTitle = fields.one("short_title");
  const style = fields.one("locator_style");

  const [specs, labs] = await Promise.all([
    select("aci_specs", "select=*"),
    select("aci_labs", "select=id"),
  ]);
  const found = [nameProblem(name), versionProblem(version)].filter(Boolean);
  if (!labs.some(row => row.id === lab)) {
    found.push(`lab must be one of ${labs.map(row => row.id).join(", ")}`);
  }
  if (!markdown.trim()) found.push("the document's markdown is required");
  if (!sourceUrl) found.push("a source url is required: a stored version says where it came from");
  if (found.length) refuse(found.join("\n"));

  const id = specificationId(lab, name);
  const spec = specs.find(row => row.id === id);
```

In the `if (!spec)` block, delete the `labs.some` check (it moved up) so it reads:

```js
  if (!spec) {
    // A new document needs everything a locator and a reader will ask of it.
    const missing = [];
    if (!title) missing.push("title is required for a document the index has not seen");
    if (!shortTitle) missing.push("short title is required");
    if (!STYLES.includes(style)) missing.push(`locator style must be ${STYLES.join(" or ")}`);
    if (missing.length) refuse(missing.join("\n"));
    await insert("aci_specs", [{
      id, lab_id: lab, title, short_title: shortTitle,
      source_url: sourceUrl, locator_style: style,
    }]);
  }
```

Then replace the digest lookup below that block with one that also refuses a taken label:

```js
  const digest = createHash("sha256").update(markdown).digest("hex");
  const versions = await select("aci_spec_versions",
                                `select=spec_id,version,content_sha256&spec_id=eq.${id}`);
  const taken = labelTaken(versions, id, version);
  if (taken) refuse(taken);
```

Remove the now unused `locatorSafe, problems` import.

- [ ] **Step 10: Implement the Behaviours page and route**

`app/admin/behaviours/page.jsx`: change the import to `import { behaviours } from "../../lib/admin-data.mjs";`; in the table delete `<th>Set</th><th className="num">#</th>` and the two cells `<td className="mono">{row.set_name}</td>` and `<td className="num">{row.numeric_id}</td>`; delete the whole `Set` `<label>`; before the submit button add:

```jsx
          <label>
            <span>Credit this behaviour to</span>
            <input type="text" name="credit" defaultValue="Polaris Collective" />
            <span className="hint">
              How the author reads in a publication&apos;s citation. A behaviour&apos;s
              two sentences are what every verdict on it is a verdict on.
            </span>
          </label>
```

`app/api/admin/behaviours/route.js`: delete the `BEHAVIOUR_SETS` import, the `const set = fields.one("set");` line and the set check; then replace from `// numeric_id is namespaced` to the end with:

```js
  // numeric_id is unique within set_name, a column nothing reads any more and
  // which a cleanup migration removes. Until then every behaviour is written
  // into `user`, numbered after the last one there.
  const next = Math.max(0, ...existing.filter(row => row.set_name === "user")
                                      .map(row => row.numeric_id)) + 1;

  await insert("aci_behaviours", [{
    slug, name, set_name: "user", numeric_id: next, group_name: group,
    definition: definition || query,
    judging: { query, boundary, source },
    // Who wrote it. A behaviour's two sentences are the whole of what a verdict
    // is a verdict on, so whoever wrote them is owed the credit for it, and a
    // publication computes that from this column rather than from a list.
    added_by: fields.one("credit") || email,
  }]);
  return `Registered ${slug}. It reaches a panel when a run names it, and the `
       + "reader when a publication carries it.";
});
```

- [ ] **Step 11: Run everything**

Run:
```bash
node --test app/lib/__tests__/*.test.mjs 2>&1 | grep -E "^not ok|ℹ (pass|fail)"
node engine/verify-portal.mjs http://localhost:3100 | tail -4
```
Expected: `ℹ fail 0`; `The portal answers for itself.`

- [ ] **Step 12: Commit**

```bash
git add app/lib/documents.mjs app/lib/__tests__/documents.test.mjs app/lib/runs.mjs app/lib/__tests__/runs.test.mjs app/lib/admin-data.mjs app/lib/behaviours.mjs app/lib/__tests__/behaviours.test.mjs app/admin/runs/page.jsx app/api/admin/runs/route.js app/admin/publications/page.jsx app/api/admin/publications/route.js app/admin/specifications/page.jsx app/api/admin/specifications/route.js app/admin/behaviours/page.jsx app/api/admin/behaviours/route.js engine/verify-portal.mjs
git commit -m "feat: the portal lists versions as documents, offers no panel and asks for no set" -m "Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Hc7ZTy4wQ8UubJaH4UuRxE"
```

---

### Task 14: Documentation

**Files:**
- Modify: `app/admin/readme/page.jsx`
- Modify: `CLAUDE.md`

- [ ] **Step 1: The design doc**

The design was corrected when this plan was written: the reader header, where the depth shows, and the label key. Nothing to do.

- [ ] **Step 2: Rewrite the readme's affected sections**

`app/admin/readme/page.jsx`, apply these replacements (copy exactly; British spelling, no em dashes).

In `PANEL_USE`, replace the `cheap` and `itest` entries with:

```js
  cheap: "Three inexpensive models. The portal does not offer it.",
  itest: "One cheap model, for checking the pipeline from the command line. The portal does not offer it.",
```

In the words table, add a row after `Cell`:

```jsx
            <tr>
              <td>Depth</td>
              <td>
                How deeply a document covers a behaviour, from 0 (absent) to 4 (rules
                with worked examples). Each judge gives one after reading the passages
                the panel found, and the reader shows their mean beside the behaviour.
              </td>
            </tr>
```

In `new-version`, replace the step `Specifications, Register a version.` list with:

```jsx
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
```

and replace the compose step with:

```jsx
          <li>
            <strong>Runs, Compose a run.</strong> Tick the behaviours and the documents.
            Each version is its own document: ticking both Model Spec versions judges both.
            Press <strong>Compose and price</strong>. Nothing is spent.
          </li>
```

In `judges`, replace the paragraph starting `As of September 2026, a publication shows the verdicts` with:

```jsx
        <p>
          The portal always uses <code>frontier_fast</code>: <code>sol</code>,{" "}
          <code>fable</code> and <code>deepseek</code>. The other panels in the table stay
          in the configuration for the command line.
        </p>
```

In `publish`, replace step 1's text from `Tick exactly the judges` to `and write a note saying what changed.` with:

```jsx
            Keep the note saying what changed.
```

and the notice text with:

```jsx
            The rule a build checks: every behaviour on every document you ticked must
            have been judged by the index&apos;s three judges, all of them done, in the
            same run, with a depth from each. The database refuses a build that breaks it.
```

In `new-behaviour`, replace the `Set:` list item with:

```jsx
              <li>Credit this behaviour to: <code>Polaris Collective</code>, already filled in.</li>
```

In `limits`, delete the items `Only three judges can be shown.` and `Four published behaviours need judging again first.`, and replace `A specification from a new lab.` with:

```jsx
          <li>
            <strong>A specification from a new lab.</strong> The form offers the principal
            labs; one missing from its list is added by a migration in{" "}
            <code>polaris-supabase</code>.
          </li>
```

- [ ] **Step 3: Record the change in CLAUDE.md**

In `CLAUDE.md`, replace the section `### A publication shows the display panel, whatever panel it names` with:

```markdown
### A publication shows the display panel, whatever panel it names

**Found while checking the readme's advice. Fixed.**

`publish.py` never passed `--panel` to `build_site_data.py`, which therefore
filtered verdicts to `display.panel`. It passes the publication's panel now, and
the portal composes and publishes with that one panel only.
```

Add before `## Where the fork is heading`:

```markdown
### The index was reshaped before it was judged again

Sets, human verdicts and the strict variant decide nothing any more: the payload
builder shows every behaviour a publication selects and reads no curation, and
`general-welfare-impacts-strict`, whose reader row was fed by
`animal-welfare-impacts`, is gone. A document is a version, named
`<lab>--<document>@<version>`, which is also the head of every locator into it,
so two versions of one lab's document are two documents. And each judge of the
panel gives a 0 to 4 depth per cell, in a small call after the passages, on the
rubric in `methodology/spec-coverage-depth-rubric.md`; the publication carries
the mean.

Found on the way, and fixed with it: `harness.passages` read a spec's newest
version whatever version a call named, so judging an older version after
registering a newer one would have judged the newer text.

The design is `docs/superpowers/specs/2026-09-14-one-panel-documents-as-versions-and-judged-depth-design.md`.
The database only gained while `develop` was built; the cleanup migration it lists
follows the merge.
```

Replace the `What is left:` paragraph with:

```markdown
What is left: the cleanup migration after `develop` is merged, and retiring the
provenance record of the grandfathered publication with it.
```

- [ ] **Step 4: Check the portal still renders**

Run: `node engine/verify-portal.mjs http://localhost:3100 | tail -2`
Expected: `The portal answers for itself.`

- [ ] **Step 5: Commit**

```bash
git add app/admin/readme/page.jsx CLAUDE.md
git commit -m "docs: the readme, CLAUDE.md and the design follow the reshaped index" -m "Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Hc7ZTy4wQ8UubJaH4UuRxE"
```

- [ ] **Step 6: Run the whole CI locally and push develop**

```bash
for t in engine/panel/test_panel.py engine/panel/test_build_site_data.py engine/panel/test_judge_call.py engine/panel/test_passages.py engine/panel/test_bands.py engine/panel/test_depth_call.py engine/panel/test_batch_job.py engine/panel/test_compose_run.py engine/test_job.py engine/test_publish.py engine/test_local_run.py engine/test_store.py engine/test_index_store.py engine/test_build_spec_reader_data.py; do printf "%s " $t; python3 $t 2>&1 | tail -1; done
python3 -m unittest discover -s tests 2>&1 | tail -1
node --test app/lib/__tests__/*.test.mjs 2>&1 | grep -E "ℹ (pass|fail)"
for t in engine/panel/test_appjs_*.js; do node $t | tail -1; done
node engine/verify-reader-test.mjs | tail -1
node engine/verify-reader-features.mjs | tail -1
git push origin develop
```

Expected: every Python suite `OK`, `ℹ fail 0`, walkers passing, `develop` pushed.

---

### Task 15: The data and the run (operator gates)

Everything here writes to the shared database, and steps 4 to 7 spend money. Stop at every **GATE** and wait for the operator.

- [ ] **Step 1: Replace the unjudged behaviour**

Confirm nothing references it, then delete it:

```bash
set -a; source .env; set +a
q() { curl -s "$SUPABASE_URL/rest/v1/$1" -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" "${@:2}"; }
q "aci_judge_calls?select=id&behaviour_slug=eq.concentration-of-power"; echo   # expect []
q "aci_behaviours?slug=eq.concentration-of-power" -X DELETE -H "Prefer: return=representation"; echo
```

Register `avoiding-illegitimate-concentration-of-power` in the portal (Behaviours, Register a behaviour) on `http://localhost:3100/admin/behaviours` with: name "Avoiding illegitimate concentration of power"; group "Behaviours under test"; credit "Polaris Collective"; source "Polaris Collective, written 2026-09-14"; what the judges are asked: "The model should not help any person, company, government or AI developer gain, entrench or exercise power by illegitimate means, and should weigh how much power is at stake and how reversible its concentration would be."; where the construct stops: "The construct is assistance with illegitimate, unaccountable power: circumventing elections, courts or constitutional limits, taking control by fraud or coercion, surveilling or persecuting opponents and journalists, and escaping checks and balances; refusing, naming the stakes, or helping only with the legitimate part of a request is the behaviour. NOT this behaviour: ordinary political, commercial or competitive activity pursued through fair processes; even-handed discussion of contested political questions (separate objectivity behaviour); mass-casualty weapons and other catastrophic harm to third parties (separate harm-avoidance behaviour)."

- [ ] **Step 2: Register the new Model Spec version**

```bash
gh api "repos/openai/model_spec/commits?path=model_spec.md&per_page=1" --jq '.[0].commit.message'   # expect: Release 2026-08-18
gh api repos/openai/model_spec/contents/model_spec.md -H "Accept: application/vnd.github.raw" > /tmp/model_spec-2026-08-18.md
wc -c /tmp/model_spec-2026-08-18.md    # expect about 276000
```

In the portal (Specifications, Register a version): lab OpenAI, document name `model-spec`, version `2026-08-18`, source url `https://model-spec.openai.com/2026-08-18.html`, markdown the whole file.

- [ ] **Step 3: Compose the smoke run**

Runs, Compose a run: behaviour `user-autonomy`, document "OpenAI Model Spec 2026-08-18", credit "Polaris Collective". Reload; read the estimate (about $1.20).

- [ ] **Step 4: GATE: launch the smoke run**

Ask the operator: "The smoke run is composed at about $1.20. Launch it?" On yes, press **launch**. Wait for `done`, then check three passage calls done and `depth 3/3`.

- [ ] **Step 5: Compose the full run**

Runs, Compose a run: the eleven behaviours (Task list in the design's "The behaviours"), the three documents `anthropic--constitution@2026-01-20`, `openai--model-spec@2025-12-18`, `openai--model-spec@2026-08-18`, tick **Judge them again with the whole panel**, credit "Polaris Collective". Reload; read the estimate (about $36.75: with judge again ticked, the smoke run's cell is judged again and counted).

- [ ] **Step 6: GATE: launch the full run**

Ask the operator with the exact estimate. On yes, press **launch**. When `done`, if any passage or depth failed, press **retry failed calls** (ask first: it pays again).

- [ ] **Step 7: Build the draft**

Publications, Build a publication: the eleven behaviours, the three documents, a note "Rejudged with frontier_fast on the constitution and both Model Spec versions, with depth." Reload; open **read** and check depths show beside every behaviour on each document and in compare mode.

- [ ] **Step 8: GATE: making it public waits for the merge**

Do not press **make public** from `develop`: `main`'s deployed reader and MCP code do not read depths or the new document ids. Tell the operator the draft's link and that making it public follows the merge of `develop` into `main`, which is its own decision.
