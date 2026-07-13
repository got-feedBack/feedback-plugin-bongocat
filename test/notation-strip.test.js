import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import "../src/tunables.js";
import "../src/notation-strip.js";

const NotationStrip = window.feedBackMinigamesNotationStrip.NotationStrip;

// Pattern fixture: quarter | two-eighths | quarter-rest | four-sixteenths
const PATTERN = {
  difficulty: 3,
  seed: 1,
  barCount: 1,
  slots: [
    { type: "onset", duration: 1, onsetCount: 1 },
    { type: "onset", duration: 1, onsetCount: 2 },
    { type: "rest", duration: 1, onsetCount: 0 },
    { type: "onset", duration: 1, onsetCount: 4 },
  ],
  expectedOnsets: [0, 1, 1.5, 3, 3.25, 3.5, 3.75],
};

const NEXT = {
  difficulty: 3,
  seed: 2,
  barCount: 1,
  slots: [
    { type: "onset", duration: 1, onsetCount: 1 },
    { type: "rest", duration: 0.5, onsetCount: 0 },
    { type: "onset", duration: 1, onsetCount: 2 },
    { type: "onset", duration: 1, onsetCount: 1 },
    { type: "rest", duration: 0.5, onsetCount: 0 },
  ],
  expectedOnsets: [0, 1.5, 2, 2.5],
};

function makeStrip(container, opts) {
  const strip = new NotationStrip(container, opts || { bpm: 120 });
  strip.render();
  return strip;
}

describe("NotationStrip — render", () => {
  let container, strip;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
  });

  afterEach(() => {
    if (strip) strip.destroy();
    if (container.parentNode) container.parentNode.removeChild(container);
  });

  it("creates root and ribbon elements (no runline — HUD chips carry mode/BPM)", () => {
    strip = makeStrip(container);
    expect(container.querySelector(".bc-game-root__notation-strip")).toBeTruthy();
    expect(container.querySelector(".bc-game-root__notation-ribbon")).toBeTruthy();
    expect(container.querySelector(".bc-game-root__notation-runline")).toBeNull();
  });

  it("setRunLabel no-ops safely without the runline element", () => {
    strip = makeStrip(container, { bpm: 92, runLabel: "Learning · Guitar · 92 BPM" });
    expect(() => strip.setRunLabel("x")).not.toThrow();
  });

  it("is idempotent (second render does not duplicate DOM)", () => {
    strip = makeStrip(container);
    strip.render();
    expect(container.querySelectorAll(".bc-game-root__notation-strip").length).toBe(1);
  });
});

describe("NotationStrip — setPattern figures", () => {
  let container, strip;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    strip = makeStrip(container);
  });

  afterEach(() => {
    strip.destroy();
    if (container.parentNode) container.parentNode.removeChild(container);
  });

  it("renders a current bar with one slot per pattern slot", () => {
    strip.setPattern(PATTERN);
    const bar = container.querySelector(".bc-game-root__notation-bar--current");
    expect(bar).toBeTruthy();
    expect(bar.querySelectorAll(".bc-game-root__notation-slot").length).toBe(4);
  });

  it("renders the correct musical figure per slot type", () => {
    strip.setPattern(PATTERN);
    const bar = container.querySelector(".bc-game-root__notation-bar--current");
    expect(bar.querySelectorAll(".bc-game-root__fig-qnote").length).toBe(1);
    expect(bar.querySelectorAll(".bc-game-root__fig-beamed--e").length).toBe(1);
    expect(bar.querySelectorAll(".bc-game-root__fig-restq").length).toBe(1);
    expect(bar.querySelectorAll(".bc-game-root__fig-beamed--s").length).toBe(1);
  });

  it("renders a triplet figure with the 3 label for onsetCount 3", () => {
    strip.setPattern({
      slots: [
        { type: "onset", duration: 1, onsetCount: 3 },
        { type: "onset", duration: 1, onsetCount: 1 },
        { type: "onset", duration: 1, onsetCount: 1 },
        { type: "onset", duration: 1, onsetCount: 1 },
      ],
      expectedOnsets: [0, 1 / 3, 2 / 3, 1, 2, 3],
    });
    const bar = container.querySelector(".bc-game-root__notation-bar--current");
    expect(bar.querySelectorAll(".bc-game-root__fig-beamed--t").length).toBe(1);
    const label = bar.querySelector(".bc-game-root__fig-triplet-label");
    expect(label).toBeTruthy();
    expect(label.textContent).toBe("3");
  });

  it("renders an eighth rest for 0.5-beat rests", () => {
    strip.setPattern(NEXT);
    const bar = container.querySelector(".bc-game-root__notation-bar--current");
    expect(bar.querySelectorAll(".bc-game-root__fig-rest8").length).toBe(2);
  });

  it("every slot starts with a dashed wait badge", () => {
    strip.setPattern(PATTERN);
    const badges = container.querySelectorAll(
      ".bc-game-root__notation-bar--current .bc-game-root__grade--wait"
    );
    expect(badges.length).toBe(4);
  });

  it("renders a dimmed next-bar preview when nextPattern given", () => {
    strip.setPattern(PATTERN, NEXT);
    const next = container.querySelector(".bc-game-root__notation-bar--next");
    expect(next).toBeTruthy();
    expect(next.querySelectorAll(".bc-game-root__notation-slot").length).toBe(5);
  });

  it("omits the next bar when no nextPattern", () => {
    strip.setPattern(PATTERN);
    expect(container.querySelector(".bc-game-root__notation-bar--next")).toBeNull();
  });

  it("advancing to the on-screen next bar walks the marker instead of rebuilding", () => {
    strip.setPattern(PATTERN, [NEXT]);
    const firstBarEl = container.querySelector(".bc-game-root__notation-bar--current");

    // Play advances: NEXT becomes the current pattern
    strip.setPattern(NEXT, []);

    // The old bar is still on screen, dimmed as past — not rebuilt away
    expect(firstBarEl.parentNode).not.toBeNull();
    expect(firstBarEl.classList.contains("bc-game-root__notation-bar--past")).toBe(true);
    // The former next bar is now the current one
    const current = container.querySelector(".bc-game-root__notation-bar--current");
    expect(current).not.toBeNull();
    expect(current).not.toBe(firstBarEl);
    // Grade machinery is bound to the new current bar (5 slots in NEXT)
    expect(strip._slotEls.length).toBe(NEXT.slots.length);
  });

  it("replaces bars on repeated setPattern", () => {
    strip.setPattern(PATTERN, NEXT);
    strip.setPattern(NEXT);
    expect(container.querySelectorAll(".bc-game-root__notation-bar--current").length).toBe(1);
    expect(container.querySelector(".bc-game-root__notation-bar--next")).toBeNull();
  });

  it("ignores invalid patterns", () => {
    expect(() => strip.setPattern(null)).not.toThrow();
    expect(() => strip.setPattern({})).not.toThrow();
  });
});

describe("NotationStrip — grade badges", () => {
  let container, strip;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    strip = makeStrip(container, { bpm: 120 });
    strip.setPattern(PATTERN);
  });

  afterEach(() => {
    strip.destroy();
    if (container.parentNode) container.parentNode.removeChild(container);
  });

  function grade(onsetBeat, playerBeat, g) {
    return { onsetBeatTime: onsetBeat, playerBeatTime: playerBeat, grade: g };
  }

  it("perfect onsets paint a PERFECT badge on the owning slot", () => {
    strip.handlePatternResult({
      grades: [grade(0, 0.01, "perfect")],
    });
    const badges = container.querySelectorAll(".bc-game-root__grade");
    expect(badges[0].classList.contains("bc-game-root__grade--perfect")).toBe(true);
    expect(badges[0].textContent).toContain("PERFECT");
  });

  it("early good paints GOOD with ms offset", () => {
    // player 0.05 beats early at 120 BPM = 25ms early
    strip.handlePatternResult({
      grades: [grade(0, -0.05, "good")],
    });
    const badge = container.querySelectorAll(".bc-game-root__grade")[0];
    expect(badge.classList.contains("bc-game-root__grade--good")).toBe(true);
    expect(badge.textContent).toContain("GOOD");
    expect(badge.textContent).toContain("ms");
  });

  it("late good paints the amber LATE badge", () => {
    strip.handlePatternResult({
      grades: [grade(0, 0.08, "good")],
    });
    const badge = container.querySelectorAll(".bc-game-root__grade")[0];
    expect(badge.classList.contains("bc-game-root__grade--late")).toBe(true);
    expect(badge.textContent).toContain("LATE");
  });

  it("misses paint a MISS badge", () => {
    strip.handlePatternResult({
      grades: [grade(1, null, "miss"), grade(1.5, null, "miss")],
    });
    const badges = container.querySelectorAll(".bc-game-root__grade");
    expect(badges[1].classList.contains("bc-game-root__grade--miss")).toBe(true);
    expect(badges[1].textContent).toContain("MISS");
  });

  it("worst grade wins within a multi-onset slot", () => {
    // Slot 2 (two-eighths at beats 1, 1.5): one perfect + one miss → MISS
    strip.handlePatternResult({
      grades: [grade(1, 1.0, "perfect"), grade(1.5, null, "miss")],
    });
    const badges = container.querySelectorAll(".bc-game-root__grade");
    expect(badges[1].classList.contains("bc-game-root__grade--miss")).toBe(true);
  });

  it("rest slots keep the wait dot", () => {
    strip.handlePatternResult({
      grades: [grade(0, 0, "perfect")],
    });
    const badges = container.querySelectorAll(".bc-game-root__grade");
    expect(badges[2].classList.contains("bc-game-root__grade--wait")).toBe(true);
  });

  it("extra onsets (null expected) do not crash badge mapping", () => {
    expect(() =>
      strip.handlePatternResult({
        grades: [{ onsetBeatTime: null, playerBeatTime: 2.2, grade: "miss-extra" }],
      })
    ).not.toThrow();
  });

  it("transitions to done after a pattern result", () => {
    strip.handlePatternResult({ grades: [] });
    expect(strip.getState()).toBe("done");
  });
});

describe("NotationStrip — lifecycle and beat tracking", () => {
  let container, strip, mockClock;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    mockClock = {
      beatTime: vi.fn(() => 0),
      isRunning: () => true,
    };
    strip = makeStrip(container, { bpm: 120, beatClock: mockClock, runLabel: "Test" });
    strip.setPattern(PATTERN);
  });

  afterEach(() => {
    strip.destroy();
    if (container.parentNode) container.parentNode.removeChild(container);
  });

  it("start() transitions to playing", () => {
    strip.start();
    expect(strip.getState()).toBe("playing");
  });

  it("start() re-arms from done (next cycle after a graded bar)", () => {
    strip.start();
    strip.handlePatternResult({ grades: [] });
    expect(strip.getState()).toBe("done");
    strip.start();
    expect(strip.getState()).toBe("playing");
  });

  it("stop() returns to idle", () => {
    strip.start();
    strip.stop();
    expect(strip.getState()).toBe("idle");
  });

  it("reset() clears bars and returns to idle", () => {
    strip.start();
    strip.reset();
    expect(strip.getState()).toBe("idle");
    expect(container.querySelector(".bc-game-root__notation-bar--current")).toBeNull();
  });

  it("_setActiveSlot toggles the active class", () => {
    strip._setActiveSlot(1);
    const slots = container.querySelectorAll(
      ".bc-game-root__notation-bar--current .bc-game-root__notation-slot"
    );
    expect(slots[1].classList.contains("bc-game-root__notation-slot--active")).toBe(true);
    strip._setActiveSlot(2);
    expect(slots[1].classList.contains("bc-game-root__notation-slot--active")).toBe(false);
    expect(slots[2].classList.contains("bc-game-root__notation-slot--active")).toBe(true);
  });

  it("_updateLabelBeat no-ops safely without the runline element", () => {
    expect(() => strip._updateLabelBeat(2.5)).not.toThrow();
  });
});

describe("NotationStrip — judge integration", () => {
  it("chains onto an existing judge onResult callback", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const prior = vi.fn();
    const judge = { _onResult: prior };
    const strip = new NotationStrip(container, { judge, bpm: 120 });
    strip.render();
    strip.setPattern(PATTERN);

    const result = { grades: [] };
    judge._onResult(result);
    expect(prior).toHaveBeenCalledWith(result);
    expect(strip.getState()).toBe("done");

    strip.destroy();
    container.parentNode.removeChild(container);
  });
});

describe("NotationStrip — destroy", () => {
  it("removes DOM and nullifies references", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const strip = makeStrip(container);
    strip.setPattern(PATTERN);
    strip.destroy();
    expect(container.querySelector(".bc-game-root__notation-strip")).toBeNull();
    expect(strip._el).toBeNull();
    expect(strip._ribbonEl).toBeNull();
    expect(strip._slotEls.length).toBe(0);
    container.parentNode.removeChild(container);
  });

  it("can be called multiple times without throwing", () => {
    const container = document.createElement("div");
    const strip = makeStrip(container);
    strip.destroy();
    expect(() => strip.destroy()).not.toThrow();
  });
});
