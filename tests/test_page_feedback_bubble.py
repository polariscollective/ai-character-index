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
