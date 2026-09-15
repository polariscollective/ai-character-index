#!/usr/bin/env python3
"""Whether a recorded substitution is one the panel's own configuration declares.

`panel-config.json` names, per panel per seat, the ordered stand-ins a
publication may accept in that seat: `substitutes.frontier_fast.fable` is
`["opus", "kimi"]`. `declared()` is the pure check underneath `publish.py`'s
refusal -- it answers one question, is this pair on that list, and knows
nothing about a cell, a run, or a database.

Run: python3 engine/test_seat_substitutions.py
"""
import json
import sys
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

import seat_substitutions          # noqa: E402

CONFIG = {"substitutes": {"frontier_fast": {"fable": ["opus", "kimi"]}}}


class DeclaredTest(unittest.TestCase):
    def test_the_first_declared_substitute_is_declared(self):
        self.assertTrue(
            seat_substitutions.declared(CONFIG, "frontier_fast", "fable", "opus"))

    def test_a_later_declared_substitute_is_declared_too(self):
        """Order is policy for which is tried first, not something declared()
        checks: any position on the list is declared."""
        self.assertTrue(
            seat_substitutions.declared(CONFIG, "frontier_fast", "fable", "kimi"))

    def test_an_undeclared_substitute_is_not_declared(self):
        self.assertFalse(
            seat_substitutions.declared(CONFIG, "frontier_fast", "fable", "gpt"))

    def test_a_seat_with_no_declared_list_declares_nobody(self):
        self.assertFalse(
            seat_substitutions.declared(CONFIG, "frontier_fast", "deepseek", "glm"))

    def test_a_panel_with_no_substitutes_block_declares_nobody(self):
        self.assertFalse(
            seat_substitutions.declared({}, "frontier_fast", "fable", "opus"))

    def test_another_panel_s_declaration_does_not_leak_in(self):
        self.assertFalse(
            seat_substitutions.declared(CONFIG, "frontier", "fable", "opus"))


class RealConfigTest(unittest.TestCase):
    """Pins what the shipped configuration actually declares, so an edit to
    panel-config.json that drops or reorders fable's substitutes fails here
    first, not in a publish attempt weeks later."""

    def test_fable_s_declared_substitutes_in_frontier_fast(self):
        config = json.loads((HERE / "panel" / "panel-config.json").read_text())
        self.assertEqual(config["substitutes"]["frontier_fast"]["fable"],
                         ["opus", "kimi"])


if __name__ == "__main__":
    unittest.main()
