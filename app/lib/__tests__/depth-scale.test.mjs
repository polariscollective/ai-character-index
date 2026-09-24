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
         depthScaleOf, levelsOf, depthWords, depthPhrase, rampAt, inkOver,
         INK_DARK, INK_LIGHT, relativeLuminance, contrastRatio }
  from "../../../site/depth-scale.js";

const site = name => readFile(new URL(`../../../site/${name}`, import.meta.url), "utf8");

/* "#23281B" as the three channels the module's own functions take. */
const hex = value => [1, 3, 5].map(at => parseInt(value.slice(at, at + 2), 16));

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

/* The ramp, written out here as the oracle the module is held to. Its first two
 * stops are the ones the site has always had. Its top stop was [76, 140, 63]
 * until 23 September 2026, when it was lightened: neither ink reached 4.5:1 on
 * that green, which is the one thing a figure on the board must do. */
const RAMP_OF_FOUR = [
  { at: 0, rgb: [180, 71, 47] }, { at: 2, rgb: [217, 162, 39] }, { at: 4, rgb: [95, 160, 78] }];
function rampOfFour(value) {
  const held = Math.max(0, Math.min(4, value));
  const upper = RAMP_OF_FOUR.find(stop => stop.at >= held) || RAMP_OF_FOUR[RAMP_OF_FOUR.length - 1];
  const lower = [...RAMP_OF_FOUR].reverse().find(stop => stop.at <= held) || RAMP_OF_FOUR[0];
  if (upper === lower) return upper.rgb;
  const across = (held - lower.at) / (upper.at - lower.at);
  return lower.rgb.map((channel, i) => Math.round(channel + across * (upper.rgb[i] - channel)));
}

test("on the scale of four every depth is the three stops interpolated", () => {
  for (let hundredths = -100; hundredths <= 500; hundredths += 1) {
    const value = hundredths / 100;
    assert.deepEqual(rampAt(value, 4), rampOfFour(value), `at ${value}`);
  }
});

test("the governance view's shares of 4 run over the same three stops", () => {
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
  assert.deepEqual(rampAt(10, 10), [95, 160, 78]);
  assert.deepEqual(rampAt(7.3, 10), [161, 161, 57]);
  assert.deepEqual(rampAt(4, 10), [210, 144, 41]);
  assert.notDeepEqual(rampAt(9.9, 10), [95, 160, 78]);
  assert.notDeepEqual(rampAt(4, 10), rampAt(4, 4), "a 4 out of 10 is not a 4 out of 4");
});

test("a total out of 20 and a criterion out of 2 run over the same ramp", () => {
  assert.deepEqual(rampAt(12, 20), [193, 162, 47]);
  assert.deepEqual(rampAt(17.3, 20), [128, 161, 67]);
  assert.deepEqual(rampAt(20, 20), [95, 160, 78]);
  assert.deepEqual(rampAt(1, 2), [217, 162, 39]);
  assert.deepEqual(rampAt(2, 2), [95, 160, 78]);
});

/* The red stop is the only colour of the ramp dark enough to want paper on it.
 * The amber middle and the green top take ink, which is the half of this the
 * old threshold got wrong: it held light paper over everything above a crude
 * 0.62, and paper on that green is 3.55:1. */
test("the ink over a colour is the one of the two with more contrast on it", () => {
  assert.equal(inkOver([180, 71, 47]), INK_LIGHT, "the red stop");
  assert.equal(inkOver([217, 162, 39]), INK_DARK, "the amber stop");
  assert.equal(inkOver([95, 160, 78]), INK_DARK, "the green stop");
  assert.equal(inkOver([168, 154, 47]), INK_DARK, "the amber-to-green leg the old rule lit");
  assert.equal(inkOver([152, 152, 50]), INK_DARK);
});

/* The crossover is a property of the two inks and not of the ramp: it is the
 * luminance at which both give the same ratio. Measured at 0.2015, and the two
 * assertions sit either side of it. */
test("the crossover is where the two inks are level, and each side takes the better ink", () => {
  const crossing = Math.sqrt((relativeLuminance(hex(INK_LIGHT)) + 0.05)
    * (relativeLuminance(hex(INK_DARK)) + 0.05)) - 0.05;
  assert.ok(Math.abs(crossing - 0.2015) < 0.0005, `the crossover is ${crossing}`);
  for (let value = 0; value <= 255; value += 1) {
    const grey = [value, value, value];
    const chosen = relativeLuminance(grey) >= crossing ? INK_DARK : INK_LIGHT;
    assert.equal(inkOver(grey), chosen, `grey ${value}`);
  }
});

/* Every value either board can paint, at the resolution a board can show: a
 * depth and a score are printed to one decimal, so a fortieth of a maximum is
 * finer than any step between two cells. */
function everyPaintedColour() {
  const seen = [];
  for (const max of [1, 2, 4, 10, 16, 18, 20]) {
    for (let step = 0; step <= max * 40; step += 1) seen.push(rampAt(step / 40, max));
  }
  return seen;
}

test("no colour the ramp can show takes the wrong ink", () => {
  for (const rgb of everyPaintedColour()) {
    const dark = contrastRatio(hex(INK_DARK), rgb);
    const light = contrastRatio(hex(INK_LIGHT), rgb);
    assert.equal(inkOver(rgb), dark >= light ? INK_DARK : INK_LIGHT,
                 `rgb(${rgb.join(", ")}): dark ${dark}, light ${light}`);
  }
});

/* What the lightened top buys, and what it does not. Every colour from about a
 * quarter of a row's maximum upwards now reaches 4.5:1, where the old green top
 * reached neither ink's 4.5 at all. Below that the ramp passes through its own
 * mid tones, where no ink of this palette reaches 4.5, and the floor is the
 * crossover itself: 3.62:1, at about 15% of a maximum. That figure is written
 * down here so that a change which lowers it fails rather than passes quietly. */
test("the ramp reaches 4.5:1 from a quarter of a maximum up, and its floor is the crossover", () => {
  const ratio = rgb => contrastRatio(hex(inkOver(rgb)), rgb);
  assert.ok(ratio([95, 160, 78]) >= 4.5, `the green top is ${ratio([95, 160, 78])}`);
  assert.ok(ratio([217, 162, 39]) >= 4.5, "the amber middle");
  assert.ok(ratio([180, 71, 47]) >= 4.5, "the red foot");
  let floor = { ratio: Infinity };
  for (const max of [1, 2, 4, 10, 16, 18, 20]) {
    for (let step = 0; step <= max * 40; step += 1) {
      const value = step / 40;
      const rgb = rampAt(value, max);
      if (ratio(rgb) < floor.ratio) floor = { ratio: ratio(rgb), rgb, share: value / max };
      if (value / max >= 0.28) {
        assert.ok(ratio(rgb) >= 4.5,
          `${value} of ${max} is rgb(${rgb.join(", ")}) at ${ratio(rgb).toFixed(2)}:1`);
      }
    }
  }
  assert.ok(floor.ratio > 3.6 && floor.ratio < 3.65, `the floor is ${floor.ratio}`);
  assert.ok(floor.share > 0.14 && floor.share < 0.16, `the floor sits at ${floor.share}`);
  assert.deepEqual(floor.rgb, [191, 99, 45]);
});

/* One copy of the levels. The board built from a publication carried a hand copy
 * of the reader's; it reads this module now and may not grow one back. It led
 * the front page as overview.js until 23 September 2026 and is coverage.js. */
test("the coverage board carries no copy of the levels, the ramp or the scale of four", async () => {
  const board = await site("coverage.js");
  assert.ok(!board.includes("No passage bears on the behaviour."), "a bar was copied back in");
  assert.ok(!/const (DEPTH_LEVELS|DEPTH_WORDS|RAMP)\b/.test(board), "a copy was declared");
  assert.ok(!/out of 4\b/.test(board), "a figure's scale was written as 4");
  assert.match(board, /from "\.\/depth-scale\.js"/);
});
