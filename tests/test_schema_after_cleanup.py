"""The code names nothing the cleanup migration dropped.

polaris-supabase 20260916090000_aci_cleanup_after_the_one_panel_redesign.sql drops
the tables aci_cell_curation and aci_coverage and the column
aci_publications.grandfathered. PostgREST answers a select that names a missing
table or column with an error, so code still naming one fails in production the
moment the migration is applied: until this test's commit, the reader's own
publication route selected `grandfathered`. This holds app/, engine/ and site/ to
never naming them again.

No network, no keys. Run: python3 -m unittest discover -s tests
"""
import re
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CODE = {".py", ".mjs", ".js", ".jsx", ".ts", ".tsx"}
SKIP = {"node_modules", "__pycache__", ".next"}

DROPPED_TABLES = re.compile(r"\baci_(?:cell_curation|coverage)\b")
# The column as code selects or reads it, not the word in a sentence: a select
# list (`,grandfathered` or `grandfathered,`), a property (`.grandfathered`), or a
# quoted key (`"grandfathered"`).
DROPPED_COLUMN = re.compile(r"[,.]grandfathered\b|\bgrandfathered,|[\"']grandfathered[\"']")


def is_test(path):
    """A test may name what was dropped, to prove nothing else asks for it."""
    return (path.name.startswith("test_") or ".test." in path.name
            or "__tests__" in path.parts)


def code_files():
    for top in ("app", "engine", "site"):
        for path in sorted((ROOT / top).rglob("*")):
            if (path.suffix in CODE and path.is_file() and not SKIP & set(path.parts)
                    and not is_test(path)):
                yield path


class DroppedSchemaTest(unittest.TestCase):
    def offenders(self, pattern):
        found = []
        for path in code_files():
            for number, line in enumerate(path.read_text(encoding="utf-8", errors="replace")
                                          .splitlines(), 1):
                if pattern.search(line):
                    found.append(f"{path.relative_to(ROOT)}:{number}: {line.strip()}")
        return found

    def test_no_code_names_a_dropped_table(self):
        self.assertEqual(self.offenders(DROPPED_TABLES), [])

    def test_no_code_selects_or_reads_the_dropped_column(self):
        self.assertEqual(self.offenders(DROPPED_COLUMN), [])

    def test_the_scan_reads_the_code_it_claims_to(self):
        scanned = {str(path.relative_to(ROOT)) for path in code_files()}
        for expected in ("app/lib/publications.mjs", "engine/verify_supabase_provenance.py",
                         "engine/index_store.py", "site/spec-reader/app.js"):
            self.assertIn(expected, scanned)


if __name__ == "__main__":
    unittest.main()
