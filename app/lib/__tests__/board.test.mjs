/**
 * The board both views of the overview draw. Its pure parts are tested here;
 * what it builds in a page is walked in a browser by
 * engine/verify-reader-features.mjs, in the governance section that already
 * exists and in the coverage section Task 8 adds.
 *
 * Run: node --test app/lib/__tests__/board.test.mjs
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import { ORDINALS, level, rankBy } from "../../../site/board.js";
import { rampAt } from "../../../site/depth-scale.js";

const site = name => readFile(new URL(`../../../site/${name}`, import.meta.url), "utf8");

test("a rank is one more than the number of items ahead, so level items share a place", () => {
  const ahead = (a, b) => a.total > b.total && !level(a.total, b.total);
  const ranked = rankBy([{ name: "a", total: 9 }, { name: "b", total: 7 },
                         { name: "c", total: 7 }, { name: "d", total: 4 }], ahead);
  assert.deepEqual(ranked.map(one => `${one.name}${one.rank}`), ["a1", "b2", "c2", "d4"]);
});

test("the rank rule takes whatever tiebreak its view has, and takes none as a tie", () => {
  const items = [{ name: "a", total: 7, second: 1 }, { name: "b", total: 7, second: 3 }];
  const onTotal = (a, b) => a.total > b.total && !level(a.total, b.total);
  const onSecond = (a, b) => (level(a.total, b.total) ? a.second > b.second
    : a.total > b.total);
  assert.deepEqual(rankBy(items, onTotal).map(one => one.rank), [1, 1]);
  assert.deepEqual(rankBy(items, onSecond).map(one => one.rank), [2, 1]);
});

test("nine ordinals, so a board of nine labs can say which place is shared", () => {
  assert.equal(ORDINALS.length, 9);
  assert.equal(ORDINALS[0], "first");
});

/* The governance view painted a score as a share of 4; the board paints every
 * row over its own maximum. The two must be the same colour, or that view
 * changed in a task that was not allowed to change it. */
test("painting over a row's own maximum is the colour the share of 4 wore", () => {
  for (const max of [2, 4, 6, 8, 10, 12, 16, 20, 40]) {
    for (let twice = 0; twice <= max * 2; twice += 1) {
      const value = twice / 2;
      assert.deepEqual(rampAt(value, max), rampAt((value / max) * 4, 4), `${value} of ${max}`);
    }
  }
});

test("the governance view keeps no copy of what moved to the board", async () => {
  const governance = await site("governance.js");
  for (const name of ["placePopover", "openPopover", "refill", "wirePopover", "rowToggle",
                      "subRow", "rowHead", "setExpanded", "scoreCell", "naCell", "chip"]) {
    assert.ok(!new RegExp(`function ${name}\\b`).test(governance), `${name} was left behind`);
  }
  assert.match(governance, /from "\.\/board\.js"/);
});
