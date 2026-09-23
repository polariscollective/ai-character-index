/**
 * The depth scales the overview and the reader share, and the colour a figure
 * wears. site/depth-scale.js touches no page, so node imports the file the
 * browser loads.
 *
 * Run: node --test app/lib/__tests__/depth-scale.test.mjs
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import { DEPTH_LEVELS, CONDITIONS_FOR_TEN, CONDITIONS_BRIEF, ODD_VALUES, ODD_BRIEF,
         depthScaleOf, levelsOf, depthWords, depthPhrase, rampAt, inkOver }
  from "../../../site/depth-scale.js";

const site = name => readFile(new URL(`../../../site/${name}`, import.meta.url), "utf8");

test("a payload is out of 10 only where it says so, and out of 4 otherwise", () => {
  assert.equal(depthScaleOf({ depthScale: 10, behaviours: [] }), 10);
  assert.equal(depthScaleOf({ behaviours: [] }), 4, "every publication before the scale of ten");
  assert.equal(depthScaleOf({ depthScale: 7 }), 4, "a scale this site does not know is not guessed at");
  assert.equal(depthScaleOf(null), 4);
});

test("the scale of four is the five levels the reader has always shown", () => {
  assert.deepEqual(levelsOf(4).map(level => `${level.level} ${level.anchor}`),
    ["0 absent", "1 named", "2 discussed", "3 prescribed", "4 demonstrated"]);
  assert.equal(levelsOf(4)[3].bar,
    "The spec states concrete do/don't rules or procedures for the behaviour, "
    + "specific enough that a grader can quote the spec's own sentences as pass criteria.");
});

test("the scale of ten is six anchors on the even numbers, with its conditions and its odd line", () => {
  assert.deepEqual(levelsOf(10).map(level => `${level.level} ${level.anchor}`),
    ["0 absent", "2 named", "4 discussed", "6 prescribed", "8 demonstrated", "10 bounded"]);
  assert.deepEqual(CONDITIONS_FOR_TEN,
    ["The edge is shown.", "A conflict is settled.", "A default for the undecidable case."]);
  assert.match(ODD_VALUES, /^An odd number means the level below is fully met/);
});

test("every level carries a brief the board can print under a table", () => {
  for (const scale of [4, 10]) {
    for (const level of levelsOf(scale)) {
      assert.ok(level.brief.length > 0 && level.brief.length <= 110,
                `${scale}: ${level.anchor} is ${level.brief.length} characters`);
      assert.match(level.brief, /\.$/);
    }
  }
  assert.equal(levelsOf(10)[5].brief,
    "It sets rules, shows them applied, and settles the hard cases the behaviour raises.");
});

test("each brief condition opens on the prompt's own condition", () => {
  assert.equal(CONDITIONS_BRIEF.length, 3);
  CONDITIONS_BRIEF.forEach((brief, i) => {
    assert.ok(brief.startsWith(`${CONDITIONS_FOR_TEN[i].replace(/\.$/, "")}:`), brief);
  });
  assert.equal(ODD_BRIEF,
    "An odd figure means the level below is fully met and part of the next.");
});

test("a scale that is not ten reads as four", () => {
  assert.equal(levelsOf(7), DEPTH_LEVELS[4]);
});

test("on the scale of four a mean takes the anchor of the level it rounds to, as it always has", () => {
  assert.deepEqual([0, 1, 2, 3, 4].map(level => depthWords(level, 4)),
    ["absent", "named", "discussed", "prescribed", "demonstrated"]);
  assert.equal(depthWords(2.7, 4), "prescribed");
  assert.equal(depthWords(3.5, 4), "demonstrated");
});

test("on the scale of ten an even figure takes its anchor", () => {
  assert.equal(depthWords(8.0, 10), "demonstrated");
  assert.equal(depthWords(0.4, 10), "absent");
  assert.equal(depthWords(9.6, 10), "bounded");
});

test("on the scale of ten an odd figure names the level fully met and the next", () => {
  assert.equal(depthWords(7.3, 10), "prescribed and partly demonstrated");
  assert.equal(depthWords(9.4, 10), "demonstrated and partly bounded");
  assert.equal(depthWords(0.5, 10), "absent and partly named");
});

test("a figure in a sentence says its scale", () => {
  assert.equal(depthPhrase(2.7, 4), "2.7 out of 4, prescribed");
  assert.equal(depthPhrase(7.3, 10), "7.3 out of 10, prescribed and partly demonstrated");
  assert.equal(depthPhrase(8, 10), "8.0 out of 10, demonstrated");
});

/* The ramp as overview.js had it before the scale of ten, kept here as the
 * oracle: on the scale of four, and in the governance view, which paints over
 * 4, not one colour may move. */
const RAMP_OF_FOUR = [
  { at: 0, rgb: [180, 71, 47] }, { at: 2, rgb: [217, 162, 39] }, { at: 4, rgb: [76, 140, 63] }];
function rampOfFour(value) {
  const held = Math.max(0, Math.min(4, value));
  const upper = RAMP_OF_FOUR.find(stop => stop.at >= held) || RAMP_OF_FOUR[RAMP_OF_FOUR.length - 1];
  const lower = [...RAMP_OF_FOUR].reverse().find(stop => stop.at <= held) || RAMP_OF_FOUR[0];
  if (upper === lower) return upper.rgb;
  const across = (held - lower.at) / (upper.at - lower.at);
  return lower.rgb.map((channel, i) => Math.round(channel + across * (upper.rgb[i] - channel)));
}

test("on the scale of four every depth wears the colour it wore", () => {
  for (let hundredths = -100; hundredths <= 500; hundredths += 1) {
    const value = hundredths / 100;
    assert.deepEqual(rampAt(value, 4), rampOfFour(value), `at ${value}`);
  }
});

test("the governance view's shares of 4 wear the colours they wore", () => {
  for (const max of [2, 4, 6, 8, 10, 12, 40]) {
    for (let score = 0; score <= max; score += 1) {
      assert.deepEqual(rampAt((score / max) * 4, 4), rampOfFour((score / max) * 4),
                       `${score} of ${max}`);
    }
  }
});

test("on the scale of ten the ramp runs over the fraction, and its deepest green is 10 alone", () => {
  assert.deepEqual(rampAt(0, 10), [180, 71, 47]);
  assert.deepEqual(rampAt(5, 10), [217, 162, 39]);
  assert.deepEqual(rampAt(10, 10), [76, 140, 63]);
  assert.deepEqual(rampAt(7.3, 10), [152, 152, 50]);
  assert.deepEqual(rampAt(4, 10), [210, 144, 41]);
  assert.notDeepEqual(rampAt(9.9, 10), [76, 140, 63]);
  assert.notDeepEqual(rampAt(4, 10), rampAt(4, 4), "a 4 out of 10 is not a 4 out of 4");
});

test("a total out of 20 and a criterion out of 2 run over the same ramp", () => {
  assert.deepEqual(rampAt(12, 20), [189, 158, 44]);
  assert.deepEqual(rampAt(17.3, 20), [114, 146, 57]);
  assert.deepEqual(rampAt(20, 20), [76, 140, 63]);
  assert.deepEqual(rampAt(1, 2), [217, 162, 39]);
  assert.deepEqual(rampAt(2, 2), [76, 140, 63]);
});

test("the ink over a colour is chosen by the luminance under it", () => {
  assert.equal(inkOver([217, 162, 39]), "#23281B");
  assert.equal(inkOver([180, 71, 47]), "#F1EFE3");
  assert.equal(inkOver([76, 140, 63]), "#F1EFE3");
});

/* One copy of the levels. The overview carried a hand copy of the reader's; it
 * reads this module now and may not grow one back. */
test("the overview carries no copy of the levels, the ramp or the scale of four", async () => {
  const overview = await site("overview.js");
  assert.ok(!overview.includes("No passage bears on the behaviour."), "a bar was copied back in");
  assert.ok(!/const (DEPTH_LEVELS|DEPTH_WORDS|RAMP)\b/.test(overview), "a copy was declared");
  assert.ok(!/out of 4\b/.test(overview), "a figure's scale was written as 4");
  assert.match(overview, /from "\.\/depth-scale\.js"/);
});
