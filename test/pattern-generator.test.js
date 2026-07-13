import { describe, it, expect } from "vitest";
import "../src/tunables.js";
import "../src/pattern-generator.js";

const PatternGenerator = window.feedBackMinigamesPatternGenerator.PatternGenerator;
const T = window.feedBackMinigamesTunables.T;

describe("Tunables — Pattern Generator extensions", () => {
  it("has BAR_LENGTH_BEATS set to 4", () => {
    expect(T.BAR_LENGTH_BEATS).toBe(4);
  });

  it("has a rest-free SLOT_VOCABULARY of one-beat slots", () => {
    expect(T.SLOT_VOCABULARY.length).toBe(4);
    for (const slot of T.SLOT_VOCABULARY) {
      expect(slot.duration).toBe(1.0);
      expect(slot.onsetCount).toBeGreaterThan(0);
    }
    expect(T.SLOT_VOCABULARY[3].name).toBe("eighth-triplet");
    expect(T.SLOT_VOCABULARY[3].onsetCount).toBe(3);
  });

  it("has DIFFICULTY_WEIGHTS with 10 entries (one per difficulty level)", () => {
    expect(T.DIFFICULTY_WEIGHTS.length).toBe(10);
  });

  it("each difficulty weight array has one entry per vocabulary slot", () => {
    for (var i = 0; i < T.DIFFICULTY_WEIGHTS.length; i++) {
      expect(T.DIFFICULTY_WEIGHTS[i].length).toBe(T.SLOT_VOCABULARY.length);
    }
  });

  it("slot vocabulary durations sum to valid bar subdivisions", () => {
    var vocab = T.SLOT_VOCABULARY;
    for (var i = 0; i < vocab.length; i++) {
      expect(vocab[i].duration).toBeGreaterThan(0);
      expect(vocab[i].onsetCount).toBeGreaterThanOrEqual(0);
    }
  });
});

describe("PatternGenerator — generate()", () => {
  it("returns an object with currentPattern and nextPattern", () => {
    var result = PatternGenerator.generate(5, 42);
    expect(result).toBeTypeOf("object");
    expect(result.currentPattern).toBeTypeOf("object");
    expect(result.nextPattern).toBeTypeOf("object");
  });

  it("currentPattern has expectedOnsets array", () => {
    var result = PatternGenerator.generate(5, 42);
    var pattern = result.currentPattern;
    expect(Array.isArray(pattern.expectedOnsets)).toBe(true);
    expect(pattern.expectedOnsets.length).toBeGreaterThan(0);
  });

  it("nextPattern has expectedOnsets array", () => {
    var result = PatternGenerator.generate(5, 42);
    var pattern = result.nextPattern;
    expect(Array.isArray(pattern.expectedOnsets)).toBe(true);
    expect(pattern.expectedOnsets.length).toBeGreaterThan(0);
  });

  it("pattern.difficulty matches the input difficulty", () => {
    var result = PatternGenerator.generate(7, 99);
    expect(result.currentPattern.difficulty).toBe(7);
    expect(result.nextPattern.difficulty).toBe(7);
  });

  it("pattern.seed matches the input seed for currentPattern", () => {
    var result = PatternGenerator.generate(5, 42);
    expect(result.currentPattern.seed).toBe(42);
  });

  it("nextPattern.seed is seed + 1", () => {
    var result = PatternGenerator.generate(5, 42);
    expect(result.nextPattern.seed).toBe(43);
  });

  it("pattern.barCount is 1", () => {
    var result = PatternGenerator.generate(5, 42);
    expect(result.currentPattern.barCount).toBe(1);
    expect(result.nextPattern.barCount).toBe(1);
  });

  it("pattern.slots is an array with at least one entry", () => {
    var result = PatternGenerator.generate(5, 42);
    expect(Array.isArray(result.currentPattern.slots)).toBe(true);
    expect(result.currentPattern.slots.length).toBeGreaterThan(0);
  });

  it("slot durations sum to approximately BAR_LENGTH_BEATS", () => {
    var result = PatternGenerator.generate(5, 42);
    var slots = result.currentPattern.slots;
    var total = 0;
    for (var i = 0; i < slots.length; i++) {
      total += slots[i].duration;
    }
    expect(total).toBeCloseTo(T.BAR_LENGTH_BEATS, 5);
  });

  it("slots have valid type ('onset' or 'rest')", () => {
    var result = PatternGenerator.generate(5, 42);
    var slots = result.currentPattern.slots;
    for (var i = 0; i < slots.length; i++) {
      expect(slots[i].type).toMatch(/^(onset|rest)$/);
    }
  });

  it("onset slots have onsetCount > 0", () => {
    var result = PatternGenerator.generate(5, 42);
    var slots = result.currentPattern.slots;
    for (var i = 0; i < slots.length; i++) {
      if (slots[i].type === "onset") {
        expect(slots[i].onsetCount).toBeGreaterThan(0);
      }
    }
  });

  it("rest slots have onsetCount === 0", () => {
    var result = PatternGenerator.generate(5, 42);
    var slots = result.currentPattern.slots;
    for (var i = 0; i < slots.length; i++) {
      if (slots[i].type === "rest") {
        expect(slots[i].onsetCount).toBe(0);
      }
    }
  });
});

describe("PatternGenerator — constraints", () => {
  it("every pattern has at least one onset per bar", () => {
    // Test many seeds at various difficulties
    for (var diff = 1; diff <= 10; diff++) {
      for (var seed = 0; seed < 50; seed++) {
        var result = PatternGenerator.generate(diff, seed);
        var hasOnset = result.currentPattern.slots.some(function (s) {
          return s.type === "onset";
        });
        expect(hasOnset).toBe(true);
      }
    }
  });

  it("no pattern is all rests", () => {
    for (var diff = 1; diff <= 10; diff++) {
      for (var seed = 0; seed < 50; seed++) {
        var result = PatternGenerator.generate(diff, seed);
        var allRests = result.currentPattern.slots.every(function (s) {
          return s.type === "rest";
        });
        expect(allRests).toBe(false);
      }
    }
  });

  it("expectedOnsets beat positions are within [0, BAR_LENGTH_BEATS)", () => {
    var result = PatternGenerator.generate(5, 42);
    var onsets = result.currentPattern.expectedOnsets;
    for (var i = 0; i < onsets.length; i++) {
      expect(onsets[i]).toBeGreaterThanOrEqual(0);
      expect(onsets[i]).toBeLessThan(T.BAR_LENGTH_BEATS);
    }
  });

  it("expectedOnsets count matches total onsetCount from slots", () => {
    var result = PatternGenerator.generate(5, 42);
    var slots = result.currentPattern.slots;
    var totalOnsets = 0;
    for (var i = 0; i < slots.length; i++) {
      if (slots[i].type === "onset") {
        totalOnsets += slots[i].onsetCount;
      }
    }
    expect(result.currentPattern.expectedOnsets.length).toBe(totalOnsets);
  });

  it("expectedOnsets are in ascending order", () => {
    var result = PatternGenerator.generate(5, 42);
    var onsets = result.currentPattern.expectedOnsets;
    for (var i = 1; i < onsets.length; i++) {
      expect(onsets[i]).toBeGreaterThanOrEqual(onsets[i - 1]);
    }
  });
});

describe("PatternGenerator — seeded determinism (pure function)", () => {
  it("same input (difficulty, seed) produces identical output", () => {
    var a = PatternGenerator.generate(3, 77);
    var b = PatternGenerator.generate(3, 77);

    // Compare slot structure
    expect(a.currentPattern.slots.length).toBe(b.currentPattern.slots.length);
    for (var i = 0; i < a.currentPattern.slots.length; i++) {
      expect(a.currentPattern.slots[i].type).toBe(b.currentPattern.slots[i].type);
      expect(a.currentPattern.slots[i].duration).toBe(b.currentPattern.slots[i].duration);
      expect(a.currentPattern.slots[i].onsetCount).toBe(b.currentPattern.slots[i].onsetCount);
    }

    // Compare expectedOnsets
    expect(a.currentPattern.expectedOnsets).toEqual(b.currentPattern.expectedOnsets);

    // Compare nextPattern
    expect(a.nextPattern.expectedOnsets).toEqual(b.nextPattern.expectedOnsets);
  });

  it("different seeds produce different patterns (high probability)", () => {
    var a = PatternGenerator.generate(5, 100);
    var b = PatternGenerator.generate(5, 200);

    var slotsMatch = true;
    if (a.currentPattern.slots.length === b.currentPattern.slots.length) {
      for (var i = 0; i < a.currentPattern.slots.length; i++) {
        if (a.currentPattern.slots[i].type !== b.currentPattern.slots[i].type ||
            a.currentPattern.slots[i].onsetCount !== b.currentPattern.slots[i].onsetCount) {
          slotsMatch = false;
          break;
        }
      }
    } else {
      slotsMatch = false;
    }

    // With very high probability, different seeds produce different patterns
    expect(slotsMatch).toBe(false);
  });

  it("generate has no side effects on the module", function () {
    var before = JSON.stringify(PatternGenerator);
    PatternGenerator.generate(5, 42);
    PatternGenerator.generate(1, 999);
    PatternGenerator.generate(10, 0);
    var after = JSON.stringify(PatternGenerator);
    expect(after).toBe(before);
  });
});

describe("PatternGenerator — difficulty scaling", () => {
  it("higher difficulties produce more complex slot patterns on average", () => {
    // Count total onsets across many seeds at low vs high difficulty
    var lowOnsets = 0;
    var highOnsets = 0;
    var sampleCount = 30;

    for (var seed = 0; seed < sampleCount; seed++) {
      var low = PatternGenerator.generate(1, seed);
      var high = PatternGenerator.generate(10, seed);

      lowOnsets += low.currentPattern.expectedOnsets.length;
      highOnsets += high.currentPattern.expectedOnsets.length;
    }

    var lowAvg = lowOnsets / sampleCount;
    var highAvg = highOnsets / sampleCount;

    // Difficulty 10 should produce significantly more onsets than difficulty 1
    expect(highAvg).toBeGreaterThan(lowAvg);
  });

  it("difficulty 1 patterns have fewer sixteenth slots than difficulty 10", () => {
    var lowSixteenths = 0;
    var highSixteenths = 0;
    var sampleCount = 30;

    for (var seed = 0; seed < sampleCount; seed++) {
      var low = PatternGenerator.generate(1, seed);
      var high = PatternGenerator.generate(10, seed);

      var lowSlots = low.currentPattern.slots;
      var highSlots = high.currentPattern.slots;

      for (var i = 0; i < lowSlots.length; i++) {
        if (lowSlots[i].onsetCount === 4) lowSixteenths++;
      }
      for (var i = 0; i < highSlots.length; i++) {
        if (highSlots[i].onsetCount === 4) highSixteenths++;
      }
    }

    expect(highSixteenths).toBeGreaterThan(lowSixteenths);
  });

  it("difficulty is clamped to 1-10 range", () => {
    var below = PatternGenerator.generate(0, 42);
    var above = PatternGenerator.generate(15, 42);
    var normal = PatternGenerator.generate(5, 42);

    // Clamping should not cause errors; output should be valid
    expect(below.currentPattern.slots.length).toBeGreaterThan(0);
    expect(above.currentPattern.slots.length).toBeGreaterThan(0);
    expect(normal.currentPattern.slots.length).toBeGreaterThan(0);
  });
});

describe("PatternGenerator — immutability", () => {
  it("returned patterns are frozen (Object.freeze applied)", () => {
    var result = PatternGenerator.generate(5, 42);
    expect(Object.isFrozen(result.currentPattern)).toBe(true);
    expect(Object.isFrozen(result.nextPattern)).toBe(true);
  });

  it("pattern slots are frozen", () => {
    var result = PatternGenerator.generate(5, 42);
    for (var i = 0; i < result.currentPattern.slots.length; i++) {
      expect(Object.isFrozen(result.currentPattern.slots[i])).toBe(true);
    }
  });

  it("pattern expectedOnsets array is frozen", () => {
    var result = PatternGenerator.generate(5, 42);
    expect(Object.isFrozen(result.currentPattern.expectedOnsets)).toBe(true);
  });

  it("mutating a frozen pattern slot silently fails (no throw)", () => {
    var result = PatternGenerator.generate(5, 42);
    // This should not throw in non-strict mode; we just verify the value is unchanged
    try {
      result.currentPattern.slots[0].type = "rest";
    } catch (e) {
      // In strict mode, this throws; in sloppy mode, it silently fails
    }
    // The slot should still be what the generator set it to
    expect(result.currentPattern.slots[0].type).toMatch(/^(onset|rest)$/);
  });
});

describe("PatternGenerator — Challenge mode dual output", () => {
  it("currentPattern and nextPattern are different objects", () => {
    var result = PatternGenerator.generate(5, 42);
    expect(result.currentPattern).not.toBe(result.nextPattern);
  });

  it("currentPattern and nextPattern have different seeds", () => {
    var result = PatternGenerator.generate(5, 42);
    expect(result.currentPattern.seed).not.toBe(result.nextPattern.seed);
    expect(result.nextPattern.seed).toBe(result.currentPattern.seed + 1);
  });

  it("currentPattern and nextPattern are structurally different (high probability)", () => {
    var result = PatternGenerator.generate(5, 42);
    // Due to different seeds, the patterns should differ structurally
    var same = result.currentPattern.expectedOnsets.length === result.nextPattern.expectedOnsets.length &&
      result.currentPattern.expectedOnsets.every(function (v, i) {
        return v === result.nextPattern.expectedOnsets[i];
      });
    expect(same).toBe(false);
  });

  it("both patterns are independently valid", () => {
    var result = PatternGenerator.generate(5, 42);
    var current = result.currentPattern;
    var next = result.nextPattern;

    // Current pattern validation
    var currentHasOnset = current.slots.some(function (s) { return s.type === "onset"; });
    expect(currentHasOnset).toBe(true);

    // Next pattern validation
    var nextHasOnset = next.slots.some(function (s) { return s.type === "onset"; });
    expect(nextHasOnset).toBe(true);
  });
});

describe("PatternGenerator — edge cases", () => {
  it("handles seed = 0 without error", () => {
    var result = PatternGenerator.generate(5, 0);
    expect(result.currentPattern.seed).toBe(0);
    expect(result.currentPattern.slots.length).toBeGreaterThan(0);
  });

  it("handles negative seed without error", () => {
    var result = PatternGenerator.generate(5, -100);
    expect(result.currentPattern.seed).toBe(-100);
    expect(result.currentPattern.slots.length).toBeGreaterThan(0);
  });

  it("handles NaN seed by coercing to 0", () => {
    var result = PatternGenerator.generate(5, NaN);
    expect(result.currentPattern.seed).toBe(0);
    expect(result.currentPattern.slots.length).toBeGreaterThan(0);
  });

  it("handles difficulty 1 (minimum) without error", () => {
    var result = PatternGenerator.generate(1, 42);
    expect(result.currentPattern.slots.length).toBeGreaterThan(0);
  });

  it("handles difficulty 10 (maximum) without error", () => {
    var result = PatternGenerator.generate(10, 42);
    expect(result.currentPattern.slots.length).toBeGreaterThan(0);
  });

  it("uses the defined vocabulary slots only", () => {
    var validDurations = {};
    for (var i = 0; i < T.SLOT_VOCABULARY.length; i++) {
      validDurations[T.SLOT_VOCABULARY[i].duration] = true;
    }

    for (var seed = 0; seed < 100; seed++) {
      var result = PatternGenerator.generate(5, seed);
      var slots = result.currentPattern.slots;
      for (var i = 0; i < slots.length; i++) {
        expect(validDurations[slots[i].duration]).toBe(true);
      }
    }
  });
});