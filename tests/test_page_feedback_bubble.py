"""The feedback bubble is on every public page, and reaches the right route.

site/page-feedback.js is one file for four pages, like dev-tag.js and brand.js:
copied into each, its wording and its route would drift, and the page nobody
remembered would be the one posting somewhere else. This holds the four pages
to carrying it.

No network, no keys. Run: python3 -m unittest discover -s tests
"""
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PAGES = ["site/overview.html", "site/about.html", "site/mcp.html",
         "site/spec-reader/index.html"]
TAG = '<script type="module" src="/page-feedback.js"></script>'
MODULE = ROOT / "site" / "page-feedback.js"


class TheBubbleIsOnEveryPublicPage(unittest.TestCase):
    def test_every_public_page_loads_the_module(self):
        for page in PAGES:
            with self.subTest(page=page):
                self.assertIn(TAG, (ROOT / page).read_text(encoding="utf-8"))

    def test_the_module_posts_to_the_route_that_exists(self):
        source = MODULE.read_text(encoding="utf-8")
        self.assertIn('const ROUTE = "/api/page-feedback";', source)
        self.assertTrue((ROOT / "app" / "api" / "page-feedback" / "route.js").exists())

    def test_the_form_carries_its_honeypot(self):
        """The route answers a filled honeypot as a success and records nothing.
        Two halves, and both have to hold: the field is built, and its value
        goes on the wire. A form that built the field and stopped sending it
        would put every spam post straight into the table."""
        source = MODULE.read_text(encoding="utf-8")
        self.assertIn('id: "pf-website"', source)
        self.assertIn('form.set("website", trap.value)', source)

    def test_the_capture_library_is_vendored(self):
        """The module fetches it by path at runtime. A missing file is a pill
        that opens a dialog saying the screenshot could not be taken."""
        library = ROOT / "site" / "vendor" / "html2canvas.min.js"
        self.assertTrue(library.exists(), "site/vendor/html2canvas.min.js is missing")
        self.assertGreater(library.stat().st_size, 100_000)
        self.assertIn('const LIBRARY = "/vendor/html2canvas.min.js";',
                      MODULE.read_text(encoding="utf-8"))

    def test_a_sticky_element_is_shifted_and_not_lifted_out_of_flow(self):
        """html2canvas draws a sticky element at its static position, so a
        reader who has scrolled would send a capture missing the header they
        were looking at. The first attempt pinned them with position:
        absolute, which takes an element out of flow and takes its space with
        it: a table header collapsed onto its own rows, and a contents rail
        let the flex sibling beside it swallow its column. Relative keeps the
        space and moves only the paint, which is what sticky itself does. A
        test naming only tagSticky and onclone passed under both, so it named
        nothing."""
        source = MODULE.read_text(encoding="utf-8")
        self.assertIn("function tagSticky()", source)
        self.assertIn("onclone: clone => {", source)
        self.assertIn("pinSticky(clone);", source)
        self.assertIn('node.style.position = "relative"', source)
        self.assertNotIn('node.style.position = "absolute"', source)

    def test_an_inner_scroll_is_carried_into_the_clone(self):
        """The prose pages scroll the window and the reader does not: it
        scrolls its own document column, so window.scrollY stays at zero
        however far down somebody has read. Without this the reader sends a
        picture of a passage they were not looking at."""
        source = MODULE.read_text(encoding="utf-8")
        self.assertIn("function tagScrolled()", source)
        self.assertIn("rescroll(clone)", source)

    def test_an_open_pop_up_is_carried_into_the_clone(self):
        """A showing dialog and an open popover live in the top layer, which
        the cloned document has no notion of. A reader who wants to report
        something about a note has to be able to photograph the note."""
        source = MODULE.read_text(encoding="utf-8")
        self.assertIn("function tagFloating(mine)", source)
        self.assertIn("placeFloating(clone)", source)
