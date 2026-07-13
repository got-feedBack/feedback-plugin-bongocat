import { describe, it, expect, beforeEach } from "vitest";
import "../src/tunables.js";
import "../src/judge.js";

const Judge = window.feedBackMinigamesJudge.Judge;
const T = window.feedBackMinigamesTunables.T;

describe("Judge — construction", () => {
  it("constructs with default tunables", () => {
    const judge = new Judge();
    expect(judge).toBeTruthy();
    expect(judge._perfectInnerMs).toBe(T.PERFECT_INNER_MS);
    expect(judge._goodOuterMs).toBe(T.GOOD_OUTER_MS);
  });

  it("constructs with custom hit windows", () => {
    const judge = new Judge({
      perfectInnerMs: 40,
      goodOuterMs: 90,
    });
    expect(judge._perfectInnerMs).toBe(40);
    expect(judge._goodOuterMs).toBe(90);
  });

  it("accepts custom BPM", () => {
    const judge = new Judge({ bpm: 140 });
    expect(judge._bpm).toBe(140);
  });

  it("stores onResult callback", () => {
    const fn = () => {};
    const judge = new Judge({ onResult: fn });
    expect(judge._onResult).toBe(fn);
  });
});

describe("Judge — setter methods", () => {
  it("setBpm updates BPM", () => {
    const judge = new Judge();
    judge.setBpm(160);
    expect(judge._bpm).toBe(160);
  });

  it("setPerfectInnerMs updates perfect window", () => {
    const judge = new Judge();
    judge.setPerfectInnerMs(50);
    expect(judge._perfectInnerMs).toBe(50);
  });

  it("setGoodOuterMs updates good window", () => {
    const judge = new Judge();
    judge.setGoodOuterMs(100);
    expect(judge._goodOuterMs).toBe(100);
  });

  it("setOnResult replaces callback", () => {
    const judge = new Judge();
    const fn = () => {};
    judge.setOnResult(fn);
    expect(judge._onResult).toBe(fn);
  });
});

describe("Judge — gradePattern", () => {
  let judge;

  beforeEach(() => {
    judge = new Judge({ bpm: 120 }); // 120 BPM = 500ms per beat
  });

  it("returns empty result for null pattern", () => {
    const result = judge.gradePattern([], null);
    expect(result.score).toBe(0);
    expect(result.totalOnsets).toBe(0);
    expect(result.clean).toBe(true);
    expect(result.grades).toEqual([]);
  });

  it("returns empty result for pattern without expectedOnsets", () => {
    const result = judge.gradePattern([], {});
    expect(result.score).toBe(0);
    expect(result.totalOnsets).toBe(0);
  });

  it("grades perfect hit within inner window", () => {
    // Perfect inner = 25ms = 0.05 beats at 120 BPM
    const pattern = { expectedOnsets: [1.0] };
    const onsets = [{ beatTime: 1.02 }]; // 20ms delta (within 25ms)

    const result = judge.gradePattern(onsets, pattern);
    expect(result.perfects).toBe(1);
    expect(result.goods).toBe(0);
    expect(result.misses).toBe(0);
    expect(result.extras).toBe(0);
    expect(result.clean).toBe(true);
  });

  it("grades good hit within outer window but outside inner", () => {
    // Perfect inner = 25ms (0.05 beats), Good outer = 60ms (0.12 beats)
    const pattern = { expectedOnsets: [1.0] };
    const onsets = [{ beatTime: 1.08 }]; // 80ms delta — within 60ms? No, 80ms > 60ms
    // Actually, at 120 BPM: 500ms/beat, so 1.08 is 0.08 beats from 1.0 = 40ms
    // 40ms is > 25ms (perfect) but < 60ms (good) — so should be good

    const result = judge.gradePattern(onsets, pattern);
    expect(result.goods).toBe(1);
    expect(result.perfects).toBe(0);
    expect(result.misses).toBe(0);
    expect(result.clean).toBe(true);
  });

  it("grades miss when outside good window", () => {
    // Good outer = 60ms = 0.12 beats at 120 BPM
    const pattern = { expectedOnsets: [1.0] };
    const onsets = [{ beatTime: 1.3 }]; // 300ms delta — outside 60ms

    const result = judge.gradePattern(onsets, pattern);
    expect(result.misses).toBe(1); // unmatched expected = miss
    expect(result.extras).toBe(1); // unmatched player = extra
    expect(result.clean).toBe(false);
  });

  it("grades extra onset when no matching pattern slot", () => {
    const pattern = { expectedOnsets: [0.5] };
    const onsets = [
      { beatTime: 0.5 },  // matches
      { beatTime: 2.0 },  // extra — outside good window of 0.5
    ];

    const result = judge.gradePattern(onsets, pattern);
    expect(result.perfects).toBe(1);
    expect(result.extras).toBe(1);
    expect(result.misses).toBe(0);
    expect(result.clean).toBe(false);
  });

  it("grades miss for unmatched expected onset", () => {
    const pattern = { expectedOnsets: [1.0, 2.0] };
    const onsets = [{ beatTime: 1.02 }]; // only hits the first

    const result = judge.gradePattern(onsets, pattern);
    expect(result.perfects).toBe(1);
    expect(result.misses).toBe(1); // second onset was missed
    expect(result.extras).toBe(0);
    expect(result.totalOnsets).toBe(2);
    expect(result.clean).toBe(false);
  });

  it("handles exact match on beat boundary", () => {
    const pattern = { expectedOnsets: [0, 1, 2, 3] };
    const onsets = [
      { beatTime: 0 },
      { beatTime: 1 },
      { beatTime: 2 },
      { beatTime: 3 },
    ];

    const result = judge.gradePattern(onsets, pattern);
    expect(result.perfects).toBe(4);
    expect(result.goods).toBe(0);
    expect(result.misses).toBe(0);
    expect(result.extras).toBe(0);
    expect(result.clean).toBe(true);
    expect(result.score).toBe(4 * (T.BASE_PERFECT || 100));
  });

  it("handles empty onsets", () => {
    const pattern = { expectedOnsets: [1.0, 2.0] };

    const result = judge.gradePattern([], pattern);
    expect(result.misses).toBe(2);
    expect(result.clean).toBe(false);
    expect(result.score).toBe(0);
  });

  it("computes score from perfects and goods", () => {
    const pattern = { expectedOnsets: [0, 1, 2] };
    const onsets = [
      { beatTime: 0 },
      { beatTime: 1.1 }, // good
      { beatTime: 2.05 }, // perfect
    ];

    const result = judge.gradePattern(onsets, pattern);
    expect(result.perfects).toBe(2);
    expect(result.goods).toBe(1);

    const expectedScore = 2 * (T.BASE_PERFECT || 100) + 1 * (T.BASE_GOOD || 60);
    expect(result.score).toBe(expectedScore);
  });
});

describe("Judge — gradePattern with custom hit windows", () => {
  it("uses custom perfectInnerMs", () => {
    const judge = new Judge({ perfectInnerMs: 200, goodOuterMs: 300, bpm: 120 });
    // 200ms = 0.4 beats at 120 BPM
    const pattern = { expectedOnsets: [1.0] };
    const onsets = [{ beatTime: 1.35 }]; // ~175ms delta — within 200ms

    const result = judge.gradePattern(onsets, pattern);
    expect(result.perfects).toBe(1);
  });

  it("uses custom goodOuterMs", () => {
    const judge = new Judge({ perfectInnerMs: 10, goodOuterMs: 200, bpm: 120 });
    // 200ms = 0.4 beats at 120 BPM
    const pattern = { expectedOnsets: [1.0] };
    const onsets = [{ beatTime: 1.3 }]; // ~150ms delta — >10ms, <200ms

    const result = judge.gradePattern(onsets, pattern);
    expect(result.goods).toBe(1);
  });
});

describe("Judge — gradePattern emission timing", () => {
  it("emitTime respects last hit window end", () => {
    const judge = new Judge({ bpm: 120 }); // 500ms/beat, goodOuterBeats = 0.12
    const pattern = { expectedOnsets: [0, 1, 2, 3] };
    // Last expected = 3, good outer = 60ms = 0.12 beats
    // lastHitWindowEnd = 3.12
    // barEndBeat = 4 (default)
    // emitTime = max(3.12, 4) = 4

    const result = judge.gradePattern([], pattern, 4);
    expect(result.emitTime).toBe(4);
  });

  it("emitTime > barEndBeat when last hit window extends past bar boundary", () => {
    const judge = new Judge({ bpm: 60 }); // 1000ms/beat → goodOuterBeats = GOOD_OUTER_MS/1000
    const pattern = { expectedOnsets: [3.95] };
    // lastHitWindowEnd = 3.95 + goodOuterBeats > barEndBeat (4)

    const result = judge.gradePattern([{ beatTime: 3.95 }], pattern, 4);
    expect(result.emitTime).toBeGreaterThan(4);
    expect(result.emitTime).toBeCloseTo(3.95 + T.GOOD_OUTER_MS / 1000, 2);
  });

  it("uses patternEnd from barEndBeat parameter", () => {
    const judge = new Judge({ bpm: 120 });
    const pattern = { expectedOnsets: [1.0] };
    // lastHitWindowEnd = 1 + 0.12 = 1.12
    // barEndBeat = 8 (custom)
    // emitTime = max(1.12, 8) = 8

    const result = judge.gradePattern([], pattern, 8);
    expect(result.emitTime).toBe(8);
  });
});

describe("Judge — gradePattern edge cases", () => {
  let judge;

  beforeEach(() => {
    judge = new Judge({ bpm: 120 });
  });

  it("extra onsets after all expected onsets matched are graded miss-extra", () => {
    const pattern = { expectedOnsets: [1.0] };
    const onsets = [
      { beatTime: 1.0 },
      { beatTime: 3.0 }, // far outside good window of 1.0
      { beatTime: 4.0 }, // also extra
    ];

    const result = judge.gradePattern(onsets, pattern);
    expect(result.perfects).toBe(1);
    expect(result.extras).toBe(2);
    expect(result.misses).toBe(0);
  });

  it("many extra onsets in between expected onsets", () => {
    const pattern = { expectedOnsets: [1.0, 3.0] };
    const onsets = [
      { beatTime: 1.0 },
      { beatTime: 2.0 }, // extra (between the two expected)
      { beatTime: 2.1 }, // extra (debounce should have caught this, but Judge doesn't debounce)
      { beatTime: 3.0 },
    ];

    const result = judge.gradePattern(onsets, pattern);
    expect(result.perfects).toBe(2);
    expect(result.extras).toBe(2);
    expect(result.misses).toBe(0);
  });

  it("grades are sorted by onsetBeatTime ascending", () => {
    const pattern = { expectedOnsets: [1.0, 2.0] };
    const onsets = [
      { beatTime: 2.05 },
      { beatTime: 1.02 },
    ];

    const result = judge.gradePattern(onsets, pattern);
    expect(result.grades.length).toBe(2);
    expect(result.grades[0].onsetBeatTime).toBeLessThan(result.grades[1].onsetBeatTime);
  });
});

describe("Judge — onResult callback", () => {
  it("fires onResult with patternResult when provided", () => {
    const results = [];
    const judge = new Judge({
      bpm: 120,
      onResult: (r) => results.push(r),
    });
    const pattern = { expectedOnsets: [1.0, 2.0] };
    const onsets = [{ beatTime: 1.0 }];

    judge.gradePattern(onsets, pattern);
    expect(results.length).toBe(1);
    expect(results[0].score).toBeTypeOf("number");
    expect(results[0].perfects).toBe(1);
    expect(results[0].misses).toBe(1);
  });

  it("gradePattern returns the same object passed to onResult", () => {
    const resultHolder = {};
    const judge = new Judge({
      bpm: 120,
      onResult: (r) => { resultHolder.val = r; },
    });

    const returned = judge.gradePattern([{ beatTime: 1.0 }], { expectedOnsets: [1.0] });
    expect(resultHolder.val).toBe(returned);
  });

  it("does not throw when onResult is null", () => {
    const judge = new Judge({ bpm: 120 });
    expect(() => {
      judge.gradePattern([{ beatTime: 1.0 }], { expectedOnsets: [1.0] });
    }).not.toThrow();
  });
});

describe("Judge — .clean flag semantics", () => {
  let judge;

  beforeEach(() => {
    judge = new Judge({ bpm: 120 });
  });

  it("clean is true when all onsets perfect", () => {
    const result = judge.gradePattern(
      [{ beatTime: 0 }, { beatTime: 1 }],
      { expectedOnsets: [0, 1] }
    );
    expect(result.clean).toBe(true);
  });

  it("clean is false when any extra onset exists", () => {
    const result = judge.gradePattern(
      [{ beatTime: 0 }, { beatTime: 0.5 }, { beatTime: 1 }],
      { expectedOnsets: [0, 1] }
    );
    expect(result.extras).toBe(1);
    expect(result.clean).toBe(false);
  });

  it("clean is false when any miss exists", () => {
    const result = judge.gradePattern(
      [{ beatTime: 0 }],
      { expectedOnsets: [0, 1] }
    );
    expect(result.misses).toBe(1);
    expect(result.clean).toBe(false);
  });

  it("clean is true when all onsets are good (no misses, no extras)", () => {
    const result = judge.gradePattern(
      [{ beatTime: 0.09 }], // 45ms at 120 BPM — within Good outer (60ms), outside Perfect inner (25ms)
      { expectedOnsets: [0] }
    );
    expect(result.goods).toBe(1);
    expect(result.misses).toBe(0);
    expect(result.extras).toBe(0);
    expect(result.clean).toBe(true); // goods alone do NOT break clean per spec
  });
});

describe("Judge — instrument-specific window widening", () => {
  it("mic (+15ms) can be applied via setPerfectInnerMs/setGoodOuterMs", () => {
    // The Judge is instrument-agnostic. Window widening is handled externally.
    const judge = new Judge({ bpm: 120 });
    judge.setPerfectInnerMs(T.PERFECT_INNER_MS + 15);
    judge.setGoodOuterMs(T.GOOD_OUTER_MS + 15);

    expect(judge._perfectInnerMs).toBe(T.PERFECT_INNER_MS + 15);
    expect(judge._goodOuterMs).toBe(T.GOOD_OUTER_MS + 15);
  });
});
describe("Judge — per-slot miss counting (life drain)", () => {
  const Judge2 = window.feedBackMinigamesJudge.Judge;

  it("four missed sixteenths in ONE slot count as one missed slot", () => {
    const judge = new Judge2({ bpm: 120 });
    const pattern = {
      slots: [
        { type: "onset", duration: 1, onsetCount: 4 },
        { type: "onset", duration: 1, onsetCount: 1 },
        { type: "onset", duration: 1, onsetCount: 1 },
        { type: "onset", duration: 1, onsetCount: 1 },
      ],
      expectedOnsets: [0, 0.25, 0.5, 0.75, 1, 2, 3],
    };
    // Hit the three quarters, whiff the whole sixteenth slot
    const onsets = [1, 2, 3].map((b) => ({ beatTime: b }));
    const result = judge.gradePattern(onsets, pattern, 4);
    expect(result.misses).toBe(4);
    expect(result.missedSlots).toBe(1);
  });

  it("misses across two slots count as two missed slots", () => {
    const judge = new Judge2({ bpm: 120 });
    const pattern = {
      slots: [
        { type: "onset", duration: 1, onsetCount: 2 },
        { type: "onset", duration: 1, onsetCount: 2 },
        { type: "onset", duration: 1, onsetCount: 1 },
        { type: "onset", duration: 1, onsetCount: 1 },
      ],
      expectedOnsets: [0, 0.5, 1, 1.5, 2, 3],
    };
    const onsets = [2, 3].map((b) => ({ beatTime: b }));
    const result = judge.gradePattern(onsets, pattern, 4);
    expect(result.misses).toBe(4);
    expect(result.missedSlots).toBe(2);
  });
});
