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
