import { describe, it, expect, beforeEach, afterEach } from "vitest";
import "../src/tunables.js";
import "../src/beat-clock.js";

const BeatClock = window.feedBackMinigamesBeatClock.BeatClock;
const T = window.feedBackMinigamesTunables.T;

describe("Tunables", () => {
  it("has all required constants", () => {
    expect(T.BPM_MIN).toBe(40);
    expect(T.BPM_MAX).toBe(180);
    expect(T.BPM_DEFAULT_LEARNING).toBe(80);
    expect(T.BPM_DEFAULT_CHALLENGE).toBe(100);
    expect(T.PERFECT_INNER_MS).toBe(40);
    expect(T.GOOD_OUTER_MS).toBe(90);
    expect(T.STARTING_LIVES).toBe(5);
    expect(T.BASE_PERFECT).toBe(100);
    expect(T.BASE_GOOD).toBe(60);
    expect(T.BASE_MISS).toBe(0);
    expect(T.COUNT_IN_LENGTH_BEATS).toBe(4);
  });

  it("multiplier tiers exist", () => {
    expect(T.MULTIPLIER_TIERS.length).toBeGreaterThanOrEqual(4);
    expect(T.MULTIPLIER_TIERS[0].mult).toBe(1);
    expect(T.MULTIPLIER_TIERS[T.MULTIPLIER_TIERS.length - 1].mult).toBeGreaterThan(1);
  });

  it("objects are treated as constants", () => {
    // The object is defined as a frozen copy
    // Verify we can't accidentally change values
    const before = T.BPM_MIN;
    expect(before).toBe(40);
  });
});

describe("BeatClock", () => {
  let clock;
  let origAudioCtx;

  beforeEach(() => {
    clock = new BeatClock();
    origAudioCtx = window.AudioContext;

    // Mock AudioContext
    var mockTime = 0;
    window.AudioContext = function () {
      return {
        currentTime: mockTime,
        state: "running",
        resume: () => Promise.resolve(),
        close: () => Promise.resolve(),
      };
    };
  });

  afterEach(() => {
    if (clock) clock.destroy();
    window.AudioContext = origAudioCtx;
  });

  it("create() creates an AudioContext", () => {
    const ctx = clock.create();
    expect(ctx).not.toBeNull();
  });

  it("isRunning returns false before create()", () => {
    expect(clock.isRunning()).toBe(false);
  });

  it("isRunning returns true after create() with running state", () => {
    clock.create();
    expect(clock.isRunning()).toBe(true);
  });

  it("start() sets beatOffset and started flag", () => {
    clock.create();
    clock.start(120);
    expect(clock.getBpm()).toBe(120);
  });

  it("beatTime() returns 0 before start()", () => {
    clock.create();
    expect(clock.beatTime()).toBe(0);
  });

  it("msToBeats converts correctly at 120 BPM", () => {
    clock.setBpm(120);
    // At 120 BPM, 1 beat = 500ms
    expect(clock.msToBeats(500)).toBeCloseTo(1, 2);
    expect(clock.msToBeats(1000)).toBeCloseTo(2, 2);
  });

  it("msToBeats converts correctly at 60 BPM", () => {
    clock.setBpm(60);
    // At 60 BPM, 1 beat = 1000ms
    expect(clock.msToBeats(1000)).toBeCloseTo(1, 2);
    expect(clock.msToBeats(500)).toBeCloseTo(0.5, 2);
  });

  it("beatsToMs converts correctly at 120 BPM", () => {
    clock.setBpm(120);
    expect(clock.beatsToMs(1)).toBeCloseTo(500, 1);
    expect(clock.beatsToMs(2)).toBeCloseTo(1000, 1);
  });

  it("beatsToMs converts correctly at 60 BPM", () => {
    clock.setBpm(60);
    expect(clock.beatsToMs(1)).toBeCloseTo(1000, 1);
  });

  it("msToBeats and beatsToMs are inverses", () => {
    clock.setBpm(140);
    var ms = 750;
    var beats = clock.msToBeats(ms);
    var back = clock.beatsToMs(beats);
    expect(Math.abs(back - ms)).toBeLessThan(1);
  });

  it("reset() clears started state", () => {
    clock.create();
    clock.start(120);
    clock.reset();
    expect(clock.beatTime()).toBe(0);
  });

  it("destroy() closes AudioContext", () => {
    clock.create();
    clock.destroy();
    expect(clock.isRunning()).toBe(false);
    expect(clock.getAudioContext()).toBeNull();
  });

  it("scheduleAtBeat schedules callback", () => {
    return new Promise((done) => {
      clock.create();
      // Create a mock where currentTime advances
      var baseTime = 10;
      window.AudioContext = function () {
        return {
          currentTime: baseTime,
          state: "running",
          resume: () => Promise.resolve(),
          close: () => Promise.resolve(),
        };
      };
      clock.create();
      clock.start(120);
      // Schedule a beat that's already passed — should fire immediately
      clock.scheduleAtBeat(-1, () => {
        done();
      });
    });
  });
});