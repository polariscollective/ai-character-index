"""A company's own text talks about that company alone.

A profile, a reading of a cell and a summary say what one company's document
does or what one company publishes, never where it stands beside another. The
only places a comparison belongs are the ones that say so in their title: the
fold "How it stands beside the other constitutions" inside a behaviour's
popover (the `same` and `differs` fields), and the takeaways, which are findings
across companies. This test holds every other per-company text to the rule by
looking for the name of any other company in it.
"""

import json
import re
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SITE = ROOT / "site"

# What a company is called in prose, its own names and products included, so a
# text about one company that names another is caught whichever name it uses.
NAMES = {
    "openai": ["OpenAI", "ChatGPT"],
    "anthropic": ["Anthropic", "Claude"],
    "alibaba": ["Alibaba", "Qwen"],
    "google": ["Google", "DeepMind", "Gemini"],
    "mistral": ["Mistral"],
    "meta": ["Meta", "Llama"],
    "xai": ["xAI", "Grok"],
    "moonshot": ["Moonshot", "Kimi"],
    "deepseek": ["DeepSeek"],
}


def strings(value):
    if isinstance(value, str):
        yield value
    elif isinstance(value, dict):
        for item in value.values():
            yield from strings(item)
    elif isinstance(value, list):
        for item in value:
            yield from strings(item)


def others_named(company, text):
    found = []
    for other, names in NAMES.items():
        if other == company:
            continue
        for name in names:
            if re.search(rf"\b{re.escape(name)}\b", text):
                found.append(name)
    return found


class CompanyTextsAreAbsolute(unittest.TestCase):
    def check(self, where, company, value):
        for text in strings(value):
            with self.subTest(where=where, company=company):
                self.assertEqual(others_named(company, text), [], text[:160])

    def test_the_cells_readings(self):
        constitutions = json.loads((SITE / "constitutions.json").read_text(encoding="utf-8"))
        for entry in constitutions["companies"]:
            company = entry["id"].split("-")[0]
            self.check("constitutions readings", company, entry.get("readings"))
        governance = json.loads((SITE / "governance.json").read_text(encoding="utf-8"))
        for company, readings in governance.get("column_readings", {}).items():
            self.check("governance column readings", company, readings)

    def test_the_profiles(self):
        constitutions = json.loads((SITE / "constitutions.json").read_text(encoding="utf-8"))
        for entry in constitutions["companies"]:
            company = entry["id"].split("-")[0]
            self.check("constitutions profile", company, entry.get("profile"))
            self.check("constitutions document as a whole", company, entry.get("whole"))
            # A behaviour's `same` and `differs` are the fold that compares, by
            # its title; what the document says and why it scores so are not.
            for slug, reading in (entry.get("behaviours") or {}).items():
                self.check(f"constitutions behaviour {slug}", company,
                           [reading.get("says"), reading.get("why")])
        governance = json.loads((SITE / "governance.json").read_text(encoding="utf-8"))
        for company, profile in governance["profiles"].items():
            self.check("governance profile", company, profile)

    def test_the_overview_summaries(self):
        overview = json.loads((SITE / "overview.json").read_text(encoding="utf-8"))
        for company, summaries in overview["summaries"].items():
            self.check("overview summary", company, summaries)


if __name__ == "__main__":
    unittest.main()
