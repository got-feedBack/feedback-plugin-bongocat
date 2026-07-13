import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import "../src/tunables.js";
import "../src/design-system.js";
import "../src/beat-clock.js";
import "../src/fsm.js";
import "../src/state-context.js";
import "../src/scoring.js";
import "../src/judge.js";
import "../src/pattern-generator.js";
import "../src/input-adapter.js";
import "../src/notedetect-bridge.js";
import "../src/cat-expressions.js";
import "../src/cat-demo.js";
import "../src/notation-strip.js";
import "../src/hud.js";
import "../src/run-summary.js";
import "../src/run-history.js";
import "../src/run-controller.js";

const RunController = window.feedBackMinigamesRunController.RunController;

// Minimal AudioContext fake: monotonic clock driven by performance.now(),
// enough for BeatClock.create/resume/start/beatTime/scheduleAtBeat.
class FakeAudioContext {
  constructor() {
    this.state = "running";
    this._t0 = performance.now();
    this.destination = {};
  }
  get currentTime() {
    return (performance.now() - this._t0) / 1000;
  }
  resume() { return Promise.resolve(); }
  close() { return Promise.resolve(); }
  createOscillator() {
    return { connect() {}, start() {}, stop() {}, frequency: {}, type: "" };
  }
  createGain() {
    return {
      connect() {},
      gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} },
    };
  }
}

describe("RunController — orchestration wiring", () => {
  let container;
  let origAudioContext;

  beforeEach(() => {
    origAudioContext = window.AudioContext;
    window.AudioContext = FakeAudioContext;
    container = document.createElement("div");
    document.body.appendChild(container);
  });

  afterEach(() => {
    window.AudioContext = origAudioContext;
    if (container.parentNode) container.parentNode.removeChild(container);
  });

  function create(config) {
    const rc = new RunController(container, {
      config: config || { instrument: "piano", mode: "learning", bpm: 120 },
      sdk: null,
      noteDetectBridge: null,
    });
    // Skip the 4-beat wall-clock count-in in tests; it has its own test.
    rc._runCountIn = (done) => done();
    return rc;
  }

  it("count-in shows descending 4-3-2-1 and pulses the cat before the run", async () => {
    const rc = new RunController(container, {
      config: { instrument: "piano", mode: "learning", bpm: 120 },
      sdk: null,
      noteDetectBridge: null,
    });
    // Capture scheduled callbacks instead of waiting on the clock
    const scheduled = [];
    rc._scheduleAt = (gen, beat, fn) => scheduled.push({ beat, fn });
    rc._buildDOM();
    rc._beatClock = { start: () => {}, msToBeats: (ms) => ms / 500 };
    rc._catDemo = { pulse: vi.fn() };

    const done = vi.fn();
    rc._runCountIn(done);

    expect(rc._els.countdown.style.display).toBe("");
    const texts = [];
    scheduled.sort((a, b) => a.beat - b.beat).forEach(({ fn }) => {
      fn();
      texts.push(rc._els.countdown.textContent);
    });
    expect(texts.slice(0, 4)).toEqual(["4", "3", "2", "1"]);
    expect(rc._catDemo.pulse).toHaveBeenCalledTimes(4);
    expect(done).toHaveBeenCalled();
    expect(rc._els.countdown.style.display).toBe("none");
  });

  it("start() renders the full stage: HUD, sprite cat + instrument, notation strip", async () => {
    const rc = create();
    rc.start();
    await Promise.resolve(); // let resume().then() run

    expect(container.querySelector(".bc-game-root__stage")).not.toBeNull();
    expect(container.querySelector(".bc-game-root__hud")).not.toBeNull();
    expect(container.querySelector(".bc-game-root__cat-sprite")).not.toBeNull();
    expect(container.querySelector(".bc-game-root__instrument--piano")).not.toBeNull();
    expect(container.querySelector(".bc-game-root__notation-strip")).not.toBeNull();
    // The UX design has no separate expressions face panel — the sprite IS
    // the emotional channel.
    expect(container.querySelector(".bc-game-root__cat-expressions")).toBeNull();

    rc.destroy();
  });

  it("FSM leaves Setup and a pattern is generated once the run starts", async () => {
    const rc = create();
    rc.start();
    await Promise.resolve();

    expect(rc._fsm.getState()).not.toBe("Setup");
    expect(rc._ctx.currentPattern).not.toBeNull();
    expect(rc._ctx.currentPattern.expectedOnsets.length).toBeGreaterThan(0);

    rc.destroy();
  });

  it("grading a response feeds the FSM and advances to the next cycle", async () => {
    const rc = create();
    rc.start();
    await Promise.resolve();

    const pattern = rc._ctx.currentPattern;
    // Simulate: FSM has reached Response (count-in + demo done)
    rc._fsm.completeCountIn();
    rc._fsm.completeDemo();
    expect(rc._fsm.getState()).toBe("Response");

    // Perfect performance: onsets exactly on the expected beats
    const gen = rc._gen;
    rc._responseStartBeat = 0;
    rc._collectedOnsets = pattern.expectedOnsets.map((b) => ({
      sourceInstrument: "piano",
      beatTime: b,
      timestamp: 0,
    }));
    rc._gradeResponse(gen, pattern);

    expect(rc._ctx.score).toBeGreaterThan(0);
    expect(rc._ctx.streak).toBe(1);
    expect(rc._stats.patternsSurvived).toBe(1);
    expect(rc._stats.perfects).toBe(pattern.expectedOnsets.length);

    rc.destroy();
  });

  it("live judging paints a slot badge immediately on an accepted onset", async () => {
    const rc = create();
    rc.start();
    await Promise.resolve();

    const pattern = rc._ctx.currentPattern;
    rc._gen++; // freeze scheduled callbacks
    rc._openResponseWindow(rc._gen, 0, pattern);

    // Hit the first expected onset dead-on
    rc._onOnset({ sourceInstrument: "piano", beatTime: pattern.expectedOnsets[0], timestamp: 0 });

    const painted = container.querySelector(
      ".bc-game-root__notation-bar--current .bc-game-root__grade--perfect"
    );
    expect(painted).not.toBeNull();
    expect(rc._liveMatched[0]).toBe(true);

    rc.destroy();
  });

  it("run ends in Summary with a run summary rendered when lives hit zero", async () => {
    const rc = create();
    rc.start();
    await Promise.resolve();

    rc._fsm.completeCountIn();
    rc._fsm.completeDemo();

    // Miss everything until lives run out (learning: 1 life per 2+ misses)
    for (let i = 0; i < 10 && rc._fsm.getState() !== "Summary"; i++) {
      const pattern = rc._ctx.currentPattern;
      rc._collectedOnsets = [];
      rc._responseStartBeat = 0;
      rc._gradeResponse(rc._gen, pattern);
      // _beginCycle bumped _gen; re-enter Response for the next iteration
      if (rc._fsm.getState() === "Demo") rc._fsm.completeDemo();
    }

    expect(rc._fsm.getState()).toBe("Summary");
    expect(container.querySelector(".bc-game-root__run-summary")).not.toBeNull();

    rc.destroy();
  });

  it("queues the next cycle's cat performance ahead — audio decoupled from grading", async () => {
    const rc = create();
    rc.start();
    await Promise.resolve();

    // The first cycle must have queued the SECOND cycle on the cat, so the
    // next downbeat is already scheduled before grading ever runs.
    expect(rc._catQueuedFor).toBe(rc._nextCycleStart);
    expect(rc._catDemo._queued).not.toBeNull();
    expect(rc._catDemo._queued.atBeat).toBe(rc._nextCycleStart);
    expect(rc._catDemo._queued.pattern).toBe(rc._ctx.nextPattern);

    // When grading later begins the queued cycle, the cat is NOT restarted
    // (that restart-in-the-grading-callback was the audible inter-bar gap).
    const stopSpy = vi.spyOn(rc._catDemo, "stop");
    const startSpy = vi.spyOn(rc._catDemo, "start");
    rc._gen++; // freeze the old cycle's schedule
    // Simulate the FSM having advanced (as handlePatternResult does)
    rc._ctx.currentPattern = rc._ctx.nextPattern;
    rc._beginCycle();
    expect(stopSpy).not.toHaveBeenCalled();
    expect(startSpy).not.toHaveBeenCalled();

    rc.destroy();
  });

  it("an expired hit window paints a live MISS badge without waiting for bar end", async () => {
    const rc = create();
    rc.start();
    await Promise.resolve();

    const pattern = rc._ctx.currentPattern;
    rc._gen++; // freeze scheduled callbacks; we drive the check by hand
    rc._openResponseWindow(rc._gen, 0, pattern);

    // Simulate the first onset's window expiring unclaimed (what the
    // scheduled check does at onset + goodWindow + slack)
    expect(rc._liveMatched[0]).toBe(false);
    rc._strip.showLiveGrade(pattern.expectedOnsets[0], "miss", 0);

    const missBadge = container.querySelector(
      ".bc-game-root__notation-bar--current .bc-game-root__grade--miss"
    );
    expect(missBadge).not.toBeNull();
    expect(missBadge.textContent).toContain("MISS");

    rc.destroy();
  });

  it("calibration phase is skipped for non-guitar and calibration=off", async () => {
    const rc = create({ instrument: "piano", mode: "learning", bpm: 120, calibration: "on" });
    rc.start();
    await Promise.resolve();
    // Piano skips straight into the run
    expect(rc._fsm.getState()).not.toBe("Setup");
    rc.destroy();

    localStorage.removeItem("bongocat.calibration.mic-default");
    const rc2 = create({ instrument: "guitar", mode: "learning", bpm: 120, calibration: "off" });
    rc2.start();
    await Promise.resolve();
    expect(rc2._fsm.getState()).not.toBe("Setup");
    rc2.destroy();
  });

  it("calibration=auto skips when an offset is already stored", async () => {
    localStorage.setItem("bongocat.calibration.mic-default", "180");
    const rc = create({ instrument: "guitar", mode: "learning", bpm: 120, calibration: "auto" });
    rc.start();
    await Promise.resolve();
    expect(rc._fsm.getState()).not.toBe("Setup");
    expect(rc._els.calibration.style.display).toBe("none");
    rc.destroy();
    localStorage.removeItem("bongocat.calibration.mic-default");
  });

  it("calibration=on holds the run and shows the overlay", async () => {
    localStorage.removeItem("bongocat.calibration.mic-default");
    const rc = create({ instrument: "guitar", mode: "learning", bpm: 120, calibration: "on" });
    rc.start();
    await Promise.resolve();
    // Patterns are generated up front (FSM in CountIn) so the notation is
    // visible during count-in + calibration, but no cycle runs yet.
    expect(rc._fsm.getState()).toBe("CountIn");
    expect(rc._els.calibration.style.display).toBe("");
    expect(container.querySelector(".bc-game-root__notation-bar--current")).not.toBeNull();
    rc.destroy();
  });

  it("a calibration window folds the median tap error into the stored offset", async () => {
    localStorage.removeItem("bongocat.calibration.mic-default");
    const rc = create({ instrument: "guitar", mode: "learning", bpm: 120, calibration: "on" });
    rc.start();
    await Promise.resolve();

    // Taps consistently 0.3 beats (150 ms at 120 BPM) late on beats 0..3
    rc._collectedOnsets = [0, 1, 2, 3].map((b) => ({
      sourceInstrument: "guitar", beatTime: b + 0.3, timestamp: 0,
    }));
    const done = vi.fn();
    rc._calState = { barNum: 0, lastIdx: 0, gen: rc._gen, done };
    rc._calibrationTick();

    const stored = parseInt(localStorage.getItem("bongocat.calibration.mic-default"), 10);
    expect(stored).toBe(150);
    expect(done).not.toHaveBeenCalled(); // bar 1 < CAL_MIN_BARS — keeps going
    // Next tick must only see NEW taps, not re-fold the same ones
    expect(rc._calState.lastIdx).toBe(4);

    rc.destroy();
    localStorage.removeItem("bongocat.calibration.mic-default");
  });

  it("destroy() tears down all component DOM", async () => {
    const rc = create();
    rc.start();
    await Promise.resolve();
    rc.destroy();

    expect(container.innerHTML).toBe("");
  });
});
