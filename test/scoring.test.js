import { describe, it, expect, beforeEach } from "vitest";
import "../src/tunables.js";
import "../src/scoring.js";

const Scoring = window.feedBackMinigamesScoring.Scoring;
const T = window.feedBackMinigamesTunables.T;

describe("Scoring — construction", () => {
  it("constructs a Scoring instance", () => {
    const s = new Scoring();
    expect(s).toBeTruthy();
    expect(s instanceof Scoring).toBe(true);
  });

  it("is exposed on window.feedBackMinigamesScoring", () => {
    expect(window.feedBackMinigamesScoring.Scoring).toBe(Scoring);
  });
});

describe("Scoring — calculateMultiplier", () => {
  let scoring;

  beforeEach(() => {
    scoring = new Scoring();
  });

  it("returns x1 for streak 0", () => {
    expect(scoring.calculateMultiplier(0)).toBe(1);
  });

  it("returns x1 for streak below first threshold", () => {
    expect(scoring.calculateMultiplier(1)).toBe(1);
    expect(scoring.calculateMultiplier(4)).toBe(1);
  });

  it("returns x2 for streak 5-9", () => {
    expect(scoring.calculateMultiplier(5)).toBe(2);
    expect(scoring.calculateMultiplier(7)).toBe(2);
    expect(scoring.calculateMultiplier(9)).toBe(2);
  });

  it("returns x3 for streak 10-19", () => {
    expect(scoring.calculateMultiplier(10)).toBe(3);
    expect(scoring.calculateMultiplier(15)).toBe(3);
    expect(scoring.calculateMultiplier(19)).toBe(3);
  });

  it("returns x4 for streak 20+ (capped)", () => {
    expect(scoring.calculateMultiplier(20)).toBe(4);
    expect(scoring.calculateMultiplier(50)).toBe(4);
    expect(scoring.calculateMultiplier(100)).toBe(4);
  });

  it("uses tunable MULTIPLIER_TIERS", () => {
    // Verify tiers match what's in tunables.js
    const tiers = T.MULTIPLIER_TIERS;
    expect(tiers.length).toBe(4);
    expect(tiers[0]).toEqual({ threshold: 0, mult: 1 });
    expect(tiers[1]).toEqual({ threshold: 5, mult: 2 });
    expect(tiers[2]).toEqual({ threshold: 10, mult: 3 });
    expect(tiers[3]).toEqual({ threshold: 20, mult: 4 });
  });
});

describe("Scoring — calculateScore", () => {
  let scoring;

  beforeEach(() => {
    scoring = new Scoring();
  });

  it("computes score from perfects, goods, streak, and bpm", () => {
    // 3 perfects at 100 = 300, 2 goods at 60 = 120, total 420
    // streak 0 = x1, bpm 80 / 80 = 1.0
    // score = 420 * 1 * 1.0 = 420
    const score = scoring.calculateScore(3, 2, 0, 80);
    expect(score).toBe(420);
  });

  it("applies multiplier from streak", () => {
    // 1 perfect = 100, streak 5 = x2, bpm 80 / 80 = 1.0
    // score = 100 * 2 * 1.0 = 200
    const score = scoring.calculateScore(1, 0, 5, 80);
    expect(score).toBe(200);
  });

  it("applies BPM scale factor", () => {
    // 1 perfect = 100, streak 0 = x1, bpm 160 / 80 = 2.0
    // score = 100 * 1 * 2.0 = 200
    const score = scoring.calculateScore(1, 0, 0, 160);
    expect(score).toBe(200);
  });

  it("combines multiplier and BPM scaling", () => {
    // 2 perfects = 200, 1 good = 60, total = 260
    // streak 10 = x3, bpm 120 / 80 = 1.5
    // score = 260 * 3 * 1.5 = 1170
    const score = scoring.calculateScore(2, 1, 10, 120);
    expect(score).toBe(1170);
  });

  it("rounds the result to an integer", () => {
    // 1 perfect = 100, streak 0 = x1, bpm 100 / 80 = 1.25
    // score = 100 * 1 * 1.25 = 125
    const score = scoring.calculateScore(1, 0, 0, 100);
    expect(score).toBe(125);
  });

  it("returns 0 when perfects and goods are both 0", () => {
    const score = scoring.calculateScore(0, 0, 0, 80);
    expect(score).toBe(0);
  });

  it("handles high BPM with maximum multiplier", () => {
    // 10 perfects = 1000, streak 50 = x4, bpm 180 / 80 = 2.25
    // score = 1000 * 4 * 2.25 = 9000
    const score = scoring.calculateScore(10, 0, 50, 180);
    expect(score).toBe(9000);
  });

  it("handles minimum BPM", () => {
    // 1 perfect = 100, streak 0 = x1, bpm 40 / 80 = 0.5
    // score = 100 * 1 * 0.5 = 50
    const score = scoring.calculateScore(1, 0, 0, 40);
    expect(score).toBe(50);
  });

  it("uses BASE_PERFECT and BASE_GOOD from tunables", () => {
    expect(T.BASE_PERFECT).toBe(100);
    expect(T.BASE_GOOD).toBe(60);
  });
});

describe("Scoring — formatScore", () => {
  let scoring;

  beforeEach(() => {
    scoring = new Scoring();
  });

  it("formats zero as '0'", () => {
    expect(scoring.formatScore(0)).toBe("0");
  });

  it("formats a small number without grouping", () => {
    // Numbers below 1000 have no grouping separator
    const result = scoring.formatScore(999);
    expect(result).toBe("999");
  });

  it("formats a large number with grouping", () => {
    const result = scoring.formatScore(1234567);
    // Remove any locale-specific grouping separator to verify digits
    var digits = result.replace(/[^0-9\-]/g, "");
    expect(digits).toBe("1234567");
    // Should contain at least one grouping separator for 7-digit numbers
    expect(result.length).toBeGreaterThan(7);
  });

  it("handles NaN by returning '0'", () => {
    expect(scoring.formatScore(NaN)).toBe("0");
  });

  it("handles undefined by returning '0'", () => {
    expect(scoring.formatScore(undefined)).toBe("0");
  });

  it("handles null by returning '0'", () => {
    expect(scoring.formatScore(null)).toBe("0");
  });

  it("handles negative scores", () => {
    const result = scoring.formatScore(-500);
    expect(result).toBe("-500");
  });
});

describe("Scoring — integration with FSM", () => {
  // This tests that the scoring module integrates correctly with the FSM
  // by verifying the interaction pattern used in FSM.handlePatternResult

  it("calculateScore is called with (perfects, goods, streak, bpm) and returns a number", () => {
    const scoring = new Scoring();
    const result = scoring.calculateScore(4, 1, 3, 100);
    expect(typeof result).toBe("number");
    expect(result).toBeGreaterThan(0);
  });

  it("multiplier lookup uses the same streak value passed to calculateScore", () => {
    const scoring = new Scoring();
    // streak 3 → x1, but if we pass different streak to calculateMultiplier, verify
    const mult = scoring.calculateMultiplier(3);
    expect(mult).toBe(1);
    // The FSM passes current streak (before increment) to both
    const score = scoring.calculateScore(1, 0, 3, 80);
    const expected = 100 * 1 * 1.0;
    expect(score).toBe(expected);
  });
});