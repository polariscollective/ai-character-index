import itertools
import sys
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import manual_review  # noqa: E402


class FakeStore:
    """Tables in memory, honouring `eq.` and `in.()` filters."""

    def __init__(self, **tables):
        self.tables = tables
        self.ids = (f"new-{n}" for n in itertools.count(1))

    def select(self, table, params=None):
        rows = self.tables.get(table, [])
        for column, condition in (params or {}).items():
            operator, _, value = condition.partition(".")
            if operator == "eq":
                rows = [r for r in rows if str(r.get(column)) == value]
            elif operator == "in":
                wanted = {v.strip('"') for v in value[1:-1].split(",")}
                rows = [r for r in rows if str(r.get(column)) in wanted]
        return rows

    def insert(self, table, rows, chunk=1000, returning=False):
        written = [dict(row, id=row.get("id") or next(self.ids)) for row in rows]
        self.tables.setdefault(table, []).extend(written)
        return written if returning else None


DOCUMENT = "anthropic--constitution@2026-01-20"
LOCATOR = f"{DOCUMENT} > #x > ¶4"


def store():
    calls = [{"id": f"c-{m}", "run_id": "r1", "behaviour_slug": "b", "spec_version_id": "v1",
              "model": m, "status": "done"} for m in ("sol", "fable", "deepseek")]
    judgements = [{"call_id": f"c-{m}", "locator": LOCATOR, "verdict": 1}
                  for m in ("sol", "fable", "deepseek")]
    return FakeStore(aci_spec_versions=[{"id": "v1", "spec_id": "anthropic--constitution",
                                         "version": "2026-01-20"}],
                     aci_judge_calls=calls, aci_judgements=judgements)


class CorrectPassageTest(unittest.TestCase):
    def test_a_correction_writes_one_manual_call_and_one_verdict(self):
        s = store()
        manual_review.correct_passage(s, "r1", "b", DOCUMENT, LOCATOR, "defining", "It is.")
        manual = [c for c in s.tables["aci_judge_calls"] if c["model"] == "manual"]
        self.assertEqual(len(manual), 1)
        [row] = [j for j in s.tables["aci_judgements"] if j["call_id"] == manual[0]["id"]]
        self.assertEqual((row["verdict"], row["note"]), (3, "It is."))

    def test_a_second_paragraph_reuses_the_manual_call(self):
        s = store()
        other = f"{DOCUMENT} > #x > ¶5"
        s.tables["aci_judgements"].append({"call_id": "c-sol", "locator": other, "verdict": 0})
        manual_review.correct_passage(s, "r1", "b", DOCUMENT, LOCATOR, "core", "A.")
        manual_review.correct_passage(s, "r1", "b", DOCUMENT, other, "related", "B.")
        self.assertEqual(len([c for c in s.tables["aci_judge_calls"]
                              if c["model"] == "manual"]), 1)

    def test_the_same_paragraph_twice_is_refused(self):
        s = store()
        manual_review.correct_passage(s, "r1", "b", DOCUMENT, LOCATOR, "core", "A.")
        with self.assertRaises(SystemExit):
            manual_review.correct_passage(s, "r1", "b", DOCUMENT, LOCATOR, "defining", "B.")

    def test_a_paragraph_the_judges_were_not_given_is_refused(self):
        with self.assertRaises(SystemExit):
            manual_review.correct_passage(store(), "r1", "b", DOCUMENT,
                                          f"{DOCUMENT} > #nope > ¶1", "core", "A.")

    def test_a_run_without_the_cell_is_refused(self):
        with self.assertRaises(SystemExit):
            manual_review.correct_passage(store(), "r2", "b", DOCUMENT, LOCATOR, "core", "A.")

    def test_a_correction_without_a_note_is_refused(self):
        with self.assertRaises(SystemExit):
            manual_review.correct_passage(store(), "r1", "b", DOCUMENT, LOCATOR, "core", " ")


if __name__ == "__main__":
    unittest.main()
