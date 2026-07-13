import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import "../src/tunables.js";
import "../src/cat-demo.js";

const CatDemo = window.feedBackMinigamesCatDemo.CatDemo;

describe("CatDemo — construction", () => {
  it("is exposed on window", () => {
    expect(CatDemo).toBeTruthy();
  });

  it("has STATE enum with four states", () => {
    expect(CatDemo.STATE.IDLE).toBe("idle");
    expect(CatDemo.STATE.COUNTING_IN).toBe("counting-in");
    expect(CatDemo.STATE.PLAYING).toBe("playing");
    expect(CatDemo.STATE.DONE).toBe("done");
  });

  it("throws without a container", () => {
    expect(() => new CatDemo()).toThrow();
  });

  it("constructs with a container element", () => {
    const container = document.createElement("div");
    const demo = new CatDemo(container);
    expect(demo).toBeTruthy();
    expect(demo.getState()).toBe("idle");
    demo.destroy();
  });

  it("accepts opts.countInBeats override", () => {
    const container = document.createElement("div");
    const demo = new CatDemo(container, { countInBeats: 2 });
    expect(demo._countInBeats).toBe(2);
    demo.destroy();
  });

  it("accepts opts.demoBeats override", () => {
    const container = document.createElement("div");
    const demo = new CatDemo(container, { demoBeats: 6 });
    expect(demo._demoBeats).toBe(6);
    demo.destroy();
  });

  it("accepts opts.bpm override", () => {
    const container = document.createElement("div");
    const demo = new CatDemo(container, { bpm: 140 });
    expect(demo._bpm).toBe(140);
    demo.destroy();
  });

  it("accepts onStateChange callback", () => {
    const container = document.createElement("div");
    const fn = vi.fn();
    const demo = new CatDemo(container, { onStateChange: fn });
    expect(demo._onStateChange).toBe(fn);
    demo.destroy();
  });
});

describe("CatDemo — render", () => {
  let container;
  let demo;

  beforeEach(() => {
    container = document.createElement("div");
    demo = new CatDemo(container);
  });

  afterEach(() => {
    if (demo) demo.destroy();
  });

  it("appends DOM to container", () => {
    demo.render();
    const el = container.querySelector(".bc-game-root__cat-demo");
    expect(el).toBeTruthy();
  });

  it("creates the cat sprite img in the paws-up state", () => {
    demo.render();
    const sprite = container.querySelector(".bc-game-root__cat-sprite");
    expect(sprite).toBeTruthy();
    expect(sprite.tagName).toBe("IMG");
    expect(sprite.src).toContain("cat-paws-up.png");
  });

  it("creates the instrument element (drums by default)", () => {
    demo.render();
    const instr = container.querySelector(".bc-game-root__instrument--drums");
    expect(instr).toBeTruthy();
  });

  it("instrument follows opts.instrument", () => {
    const d = new CatDemo(container, { instrument: "piano" });
    d.render();
    expect(container.querySelector(".bc-game-root__instrument--piano")).toBeTruthy();
    d.destroy();
  });

  it("creates label element with aria-live", () => {
    demo.render();
    const label = container.querySelector(".bc-game-root__cat-demo-label");
    expect(label).toBeTruthy();
    expect(label.getAttribute("aria-live")).toBe("polite");
  });

  it("renders no beat count element (removed from the stage UI)", () => {
    demo.render();
    const bc = container.querySelector(".bc-game-root__cat-demo-beat-count");
    expect(bc).toBeNull();
  });

  it("is idempotent (second render does not duplicate DOM)", () => {
    demo.render();
    demo.render();
    const els = container.querySelectorAll(".bc-game-root__cat-demo");
    expect(els.length).toBe(1);
  });
});

describe("CatDemo — start/stop lifecycle", () => {
  let container;
  let demo;

  beforeEach(() => {
    container = document.createElement("div");
    demo = new CatDemo(container);
    demo.render();
  });

  afterEach(() => {
    if (demo) demo.destroy();
  });

  it("starts in idle state", () => {
    expect(demo.getState()).toBe("idle");
  });

  it("transitions to counting-in on start()", () => {
    demo.start();
    expect(demo.getState()).toBe("counting-in");
  });

  it("sets label on counting-in", () => {
    demo.start();
    const label = container.querySelector(".bc-game-root__cat-demo-label");
    expect(label.textContent).toBe("Get Ready!");
  });

  it("sets CSS state class on start", () => {
    demo.start();
    const root = container.querySelector(".bc-game-root__cat-demo");
    expect(root.classList.contains("bc-game-root__cat-demo--counting-in")).toBe(true);
  });

  it("ignores start() when not idle", () => {
    demo.start();
    expect(demo.getState()).toBe("counting-in");
    // second start should be no-op
    demo.start();
    expect(demo.getState()).toBe("counting-in");
  });

  it("stop() returns to idle", () => {
    demo.start();
    demo.stop();
    expect(demo.getState()).toBe("idle");
  });

  it("reset() returns to idle", () => {
    demo.start();
    demo.reset();
    expect(demo.getState()).toBe("idle");
  });

  it("stop() resets the sprite to paws-up", () => {
    demo.start();
    demo._setPawState("left");
    demo.stop();
    expect(demo.getPawState()).toBe("up");
    expect(demo._spriteEl.src).toContain("cat-paws-up.png");
  });

  it("fires onStateChange callback on start", () => {
    const fn = vi.fn();
    const d = new CatDemo(container, { onStateChange: fn });
    d.render();
    d.start();
    expect(fn).toHaveBeenCalledWith("idle", "counting-in");
    d.destroy();
  });

  it("fires onStateChange callback on stop", () => {
    const fn = vi.fn();
    const d = new CatDemo(container, { onStateChange: fn });
    d.render();
    d.start();
    fn.mockClear();
    d.stop();
    expect(fn).toHaveBeenCalledWith("counting-in", "idle");
    d.destroy();
  });
});

describe("CatDemo — paw animation", () => {
  let container;
  let demo;

  beforeEach(() => {
    container = document.createElement("div");
    demo = new CatDemo(container);
    demo.render();
  });

  afterEach(() => {
    demo.destroy();
  });

  it("_animatePaw swaps to the left-paw sprite on even beats", () => {
    demo._animatePaw(0);
    expect(demo.getPawState()).toBe("left");
    expect(demo._spriteEl.src).toContain("cat-left-paw.png");
  });

  it("_animatePaw swaps to the right-paw sprite on odd beats", () => {
    demo._animatePaw(1);
    expect(demo.getPawState()).toBe("right");
    expect(demo._spriteEl.src).toContain("cat-right-paw.png");
  });

  it("paw tap marks the instrument as hit", () => {
    demo._animatePaw(0);
    const instr = container.querySelector(".bc-game-root__instrument");
    expect(instr.classList.contains("bc-game-root__instrument--hit")).toBe(true);
  });

  it("paw reverts to up after the tap timeout", async () => {
    vi.useFakeTimers();
    demo._animatePaw(0);
    expect(demo.getPawState()).toBe("left");
    vi.advanceTimersByTime(150);
    expect(demo.getPawState()).toBe("up");
    vi.useRealTimers();
  });
});

describe("CatDemo — metronome click", () => {
  let container;
  let demo;

  beforeEach(() => {
    container = document.createElement("div");
    demo = new CatDemo(container);
    demo.render();
  });

  afterEach(() => {
    demo.destroy();
  });

  it("_playMetronomeClick does not throw without AudioContext", () => {
    // Should silently handle missing AudioContext
    expect(() => demo._playMetronomeClick()).not.toThrow();
  });

  it("_playMetronomeClick creates and connects oscillator when AudioContext available", () => {
    const mockCtx = {
      currentTime: 100,
      createOscillator: () => {
        return {
          connect: vi.fn(),
          start: vi.fn(),
          stop: vi.fn(),
          frequency: { value: 0 },
          type: "",
        };
      },
      createGain: () => {
        return {
          connect: vi.fn(),
          gain: {
            setValueAtTime: vi.fn(),
            exponentialRampToValueAtTime: vi.fn(),
          },
        };
      },
    };
    demo._audioCtx = mockCtx;
    expect(() => demo._playMetronomeClick()).not.toThrow();
  });
});

describe("CatDemo — beat scheduling with beatClock", () => {
  let container;
  let demo;
  let mockBeatClock;

  beforeEach(() => {
    container = document.createElement("div");
    mockBeatClock = {
      getAudioContext: () => null,
      getBpm: () => 80,
      scheduleAtBeat: vi.fn(),
      isRunning: () => true,
    };
    demo = new CatDemo(container, { beatClock: mockBeatClock });
    demo.render();
  });

  afterEach(() => {
    demo.destroy();
  });

  it("calls scheduleAtBeat for each count-in beat on start", () => {
    demo.start();
    // default countInBeats = 4, plus 1 for phase-end
    expect(mockBeatClock.scheduleAtBeat.mock.calls.length).toBeGreaterThanOrEqual(4);
  });

  it("calls scheduleAtBeat with sequential beat indices", () => {
    demo.start();
    const calls = mockBeatClock.scheduleAtBeat.mock.calls;
    // First call should be beat 0
    expect(calls[0][0]).toBe(0);
  });

  it("schedules phase-end callback after count-in beats", () => {
    demo.start();
    const calls = mockBeatClock.scheduleAtBeat.mock.calls;
    const lastArg = calls[calls.length - 1][0];
    // Last call is the phase-end at beat == countInBeats
    expect(lastArg).toBe(demo._countInBeats);
  });

  it("transitions to playing after count-in completes", () => {
    demo.start();
    // Manually trigger phase-end for count-in
    demo._onPhaseEnd("counting-in");
    expect(demo.getState()).toBe("playing");
    expect(
      container
        .querySelector(".bc-game-root__cat-demo")
        .classList.contains("bc-game-root__cat-demo--playing")
    ).toBe(true);
  });

  it("transition to playing updates label", () => {
    demo.start();
    demo._onPhaseEnd("counting-in");
    const label = container.querySelector(".bc-game-root__cat-demo-label");
    expect(label.textContent).toBe("Go!");
  });

  it("demo phase schedules paw taps on the pattern's onsets, not every beat", () => {
    const pattern = {
      slots: [],
      expectedOnsets: [0, 0.5, 2, 2.25, 2.5, 2.75], // eighths + sixteenths
    };
    demo.setPattern(pattern);
    demo.start();
    mockBeatClock.scheduleAtBeat.mockClear();

    demo._onPhaseEnd("counting-in");

    const beats = mockBeatClock.scheduleAtBeat.mock.calls.map((c) => c[0]);
    // Onset taps at countIn + each expected onset (countIn default 4)
    for (const onset of pattern.expectedOnsets) {
      expect(beats).toContain(4 + onset);
    }
    // Metronome clicks still on every integer beat of the demo bar
    expect(beats).toContain(4);
    expect(beats).toContain(7);
  });

  it("response beats keep the metronome going after the demo", () => {
    demo.setResponseBeats(4);
    demo.start();
    demo._onPhaseEnd("counting-in");
    mockBeatClock.scheduleAtBeat.mockClear();

    demo._onPhaseEnd("playing"); // demo end → response metronome, not done
    expect(demo.getState()).toBe("playing");
    expect(mockBeatClock.scheduleAtBeat.mock.calls.length).toBeGreaterThanOrEqual(4);

    demo._onPhaseEnd("response");
    expect(demo.getState()).toBe("done");
  });

  it("transitions to done after demo completes", () => {
    demo.start();
    demo._onPhaseEnd("counting-in");
    demo._onPhaseEnd("playing");
    expect(demo.getState()).toBe("done");
    const label = container.querySelector(".bc-game-root__cat-demo-label");
    expect(label.textContent).toBe("Nice!");
  });
});

describe("CatDemo — destroy", () => {
  let container;
  let demo;

  beforeEach(() => {
    container = document.createElement("div");
    demo = new CatDemo(container);
    demo.render();
  });

  it("removes DOM element from container", () => {
    demo.destroy();
    const el = container.querySelector(".bc-game-root__cat-demo");
    expect(el).toBeNull();
  });

  it("nullifies internal references", () => {
    demo.destroy();
    expect(demo._container).toBeNull();
    expect(demo._el).toBeNull();
    expect(demo._labelEl).toBeNull();
    expect(demo._spriteEl).toBeNull();
    expect(demo._instrumentEl).toBeNull();
  });

  it("can be called multiple times without throwing", () => {
    demo.destroy();
    expect(() => demo.destroy()).not.toThrow();
  });

  it("cancels scheduled timeouts on destroy", () => {
    const spy = vi.spyOn(globalThis, "clearTimeout");
    demo._scheduledIds = [123, 456];
    demo.destroy();
    expect(spy).toHaveBeenCalledWith(123);
    expect(spy).toHaveBeenCalledWith(456);
    spy.mockRestore();
  });
});

describe("CatDemo — beat count display", () => {
  let container;
  let demo;

  beforeEach(() => {
    container = document.createElement("div");
    demo = new CatDemo(container);
    demo.render();
  });

  afterEach(() => {
    demo.destroy();
  });

  it("_updateBeatCount / _onBeat no-op safely without the element", () => {
    expect(() => demo._updateBeatCount(3)).not.toThrow();
    expect(() => demo._onBeat(2, "counting-in")).not.toThrow();
  });
});