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
