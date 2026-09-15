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
