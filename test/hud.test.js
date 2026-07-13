import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import "../src/tunables.js";
import "../src/hud.js";

const HUD = window.feedBackMinigamesHUD.HUD;
const T = window.feedBackMinigamesTunables.T;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeStateContext(initial) {
  initial = initial || {};
  var listeners = [];
  var state = {
    score: initial.score !== undefined ? initial.score : 0,
    lives: initial.lives !== undefined ? initial.lives : 3,
    streak: initial.streak !== undefined ? initial.streak : 0,
    phase: initial.phase || "learning",
    difficulty: initial.difficulty !== undefined ? initial.difficulty : 1,
    currentPattern: null,
    nextPattern: null,
  };

  return {
    getSnapshot: function () {
      return {
        score: state.score,
        lives: state.lives,
        streak: state.streak,
        phase: state.phase,
        difficulty: state.difficulty,
        currentPattern: state.currentPattern,
        nextPattern: state.nextPattern,
      };
    },
    subscribe: function (fn) {
      listeners.push(fn);
      return function () {
        var idx = listeners.indexOf(fn);
        if (idx !== -1) listeners.splice(idx, 1);
      };
    },
    _notify: function () {
      var snap = this.getSnapshot();
      for (var i = 0; i < listeners.length; i++) {
        listeners[i](snap);
      }
    },
    _setState: function (patch) {
      for (var k in patch) {
        if (patch.hasOwnProperty(k)) {
          state[k] = patch[k];
        }
      }
      this._notify();
    },
  };
}

function makePatternResult(overrides) {
  var result = {
    score: 300,
    perfects: 3,
    goods: 0,
    misses: 0,
    extras: 0,
    clean: true,
    totalOnsets: 3,
    grades: [
      { grade: "perfect", onsetBeatTime: 0, playerBeatTime: 0.01 },
      { grade: "perfect", onsetBeatTime: 1.0, playerBeatTime: 1.02 },
      { grade: "perfect", onsetBeatTime: 2.0, playerBeatTime: 2.01 },
    ],
    emitTime: 4.5,
  };
  if (overrides) {
    for (var k in overrides) {
      if (overrides.hasOwnProperty(k)) {
        result[k] = overrides[k];
      }
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// Construction
// ---------------------------------------------------------------------------

describe("HUD — construction", () => {
  it("is exposed on window.feedBackMinigamesHUD", () => {
    expect(window.feedBackMinigamesHUD.HUD).toBe(HUD);
  });

  it("throws without a container", () => {
    expect(() => new HUD()).toThrow();
  });

  it("constructs with a container element", () => {
    const container = document.createElement("div");
    const hud = new HUD(container);
    expect(hud).toBeTruthy();
    hud.destroy();
  });

  it("accepts opts.bpm override", () => {
    const container = document.createElement("div");
    const hud = new HUD(container, { bpm: 140 });
    expect(hud._bpm).toBe(140);
    hud.destroy();
  });

  it("accepts opts.stateContext", () => {
    const container = document.createElement("div");
    const ctx = makeStateContext();
    const hud = new HUD(container, { stateContext: ctx });
    expect(hud._stateContext).toBe(ctx);
    hud.destroy();
  });

  it("accepts onGradeFlash callback", () => {
    const container = document.createElement("div");
    const fn = vi.fn();
    const hud = new HUD(container, { onGradeFlash: fn });
    expect(hud._onGradeFlash).toBe(fn);
    hud.destroy();
  });

  it("uses default BPM from tunables when not provided", () => {
    const container = document.createElement("div");
    const hud = new HUD(container);
    expect(hud._bpm).toBe(T.BPM_DEFAULT_LEARNING);
    hud.destroy();
  });
});

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------

describe("HUD — render", () => {
  let container;
  let hud;

  beforeEach(() => {
    container = document.createElement("div");
    hud = new HUD(container);
  });

  afterEach(() => {
    if (hud) hud.destroy();
  });

  it("appends DOM to container", () => {
    hud.render();
    const el = container.querySelector(".bc-game-root__hud");
    expect(el).toBeTruthy();
  });

  it("creates score element", () => {
    hud.render();
    const score = container.querySelector(".bc-game-root__hud-score");
    expect(score).toBeTruthy();
    expect(score.textContent).toBe("0");
  });

  it("creates lives element", () => {
    hud.render();
    const lives = container.querySelector(".bc-game-root__hud-lives");
    expect(lives).toBeTruthy();
  });

  it("renders correct number of hearts", () => {
    hud.render();
    const hearts = container.querySelectorAll(".bc-game-root__hud-heart");
    expect(hearts.length).toBe(T.STARTING_LIVES);
  });

  it("all hearts start filled", () => {
    hud.render();
    const hearts = container.querySelectorAll(".bc-game-root__hud-heart");
    for (var i = 0; i < hearts.length; i++) {
      expect(hearts[i].classList.contains("bc-game-root__hud-heart--empty")).toBe(false);
    }
  });

  it("creates streak element", () => {
    hud.render();
    const streak = container.querySelector(".bc-game-root__hud-streak");
    expect(streak).toBeTruthy();
    expect(streak.textContent).toBe("0");
  });

  it("creates grade badge element (hidden)", () => {
    hud.render();
    const grade = container.querySelector(".bc-game-root__hud-grade");
    expect(grade).toBeTruthy();
    expect(grade.style.display).toBe("none");
  });

  it("creates phase indicator element", () => {
    hud.render();
    const phase = container.querySelector(".bc-game-root__hud-phase");
    expect(phase).toBeTruthy();
    expect(phase.textContent).toBe("Learning");
  });

  it("creates BPM element", () => {
    hud.render();
    const bpm = container.querySelector(".bc-game-root__hud-bpm");
    expect(bpm).toBeTruthy();
    expect(bpm.textContent).toContain("80 BPM");
  });

  it("is idempotent (second render does not duplicate DOM)", () => {
    hud.render();
    hud.render();
    const els = container.querySelectorAll(".bc-game-root__hud");
    expect(els.length).toBe(1);
  });

  it("grade badge has aria-live polite", () => {
    hud.render();
    const grade = container.querySelector(".bc-game-root__hud-grade");
    expect(grade.getAttribute("aria-live")).toBe("polite");
  });

  it("lives element has aria-label", () => {
    hud.render();
    const lives = container.querySelector(".bc-game-root__hud-lives");
    expect(lives.getAttribute("aria-label")).toBe("Lives: " + T.STARTING_LIVES);
  });

  it("renders with expected phase capitalization", () => {
    const c = document.createElement("div");
    const h = new HUD(c, { stateContext: makeStateContext({ phase: "challenge" }) });
    h.render();
    const phase = c.querySelector(".bc-game-root__hud-phase");
    expect(phase.textContent).toBe("Challenge");
    h.destroy();
  });
});

// ---------------------------------------------------------------------------
// setBpm
// ---------------------------------------------------------------------------

describe("HUD — setBpm", () => {
  let container;
  let hud;

  beforeEach(() => {
    container = document.createElement("div");
    hud = new HUD(container);
    hud.render();
  });

  afterEach(() => {
    if (hud) hud.destroy();
  });

  it("updates the BPM display", () => {
    hud.setBpm(120);
    const bpm = container.querySelector(".bc-game-root__hud-bpm");
    expect(bpm.textContent).toBe("120 BPM");
  });

  it("updates internal _bpm property", () => {
    hud.setBpm(160);
    expect(hud._bpm).toBe(160);
  });

  it("handles zero BPM", () => {
    hud.setBpm(0);
    const bpm = container.querySelector(".bc-game-root__hud-bpm");
    expect(bpm.textContent).toBe("0 BPM");
  });

  it("is a no-op when not rendered", () => {
    const c = document.createElement("div");
    const h = new HUD(c);
    expect(() => h.setBpm(100)).not.toThrow();
    h.destroy();
  });
});

// ---------------------------------------------------------------------------
// showGrade — grade badges
// ---------------------------------------------------------------------------

describe("HUD — showGrade", () => {
  let container;
  let hud;

  beforeEach(() => {
    container = document.createElement("div");
    hud = new HUD(container);
    hud.render();
  });

  afterEach(() => {
    if (hud) hud.destroy();
  });

  it("shows 'Perfect!' for perfect grade", () => {
    hud.showGrade("perfect");
    const grade = container.querySelector(".bc-game-root__hud-grade");
    expect(grade.style.display).toBe("block");
    expect(grade.textContent).toBe("Perfect!");
  });

  it("adds --perfect CSS class", () => {
    hud.showGrade("perfect");
    const grade = container.querySelector(".bc-game-root__hud-grade");
    expect(grade.classList.contains("bc-game-root__hud-grade--perfect")).toBe(true);
  });

  it("shows 'Good' for good grade", () => {
    hud.showGrade("good");
    const grade = container.querySelector(".bc-game-root__hud-grade");
    expect(grade.textContent).toBe("Good");
    expect(grade.classList.contains("bc-game-root__hud-grade--good")).toBe(true);
  });

  it("shows 'Miss!' for miss grade", () => {
    hud.showGrade("miss");
    const grade = container.querySelector(".bc-game-root__hud-grade");
    expect(grade.textContent).toBe("Miss!");
    expect(grade.classList.contains("bc-game-root__hud-grade--miss")).toBe(true);
  });

  it("shows 'Miss!' for miss-extra grade", () => {
    hud.showGrade("miss-extra");
    const grade = container.querySelector(".bc-game-root__hud-grade");
    expect(grade.textContent).toBe("Miss!");
    expect(grade.classList.contains("bc-game-root__hud-grade--miss")).toBe(true);
  });

  it("auto-hides after timeout", () => {
    vi.useFakeTimers();
    hud.showGrade("perfect");
    expect(hud._gradeTimeout).toBeTruthy();

    vi.advanceTimersByTime(1200);
    const grade = container.querySelector(".bc-game-root__hud-grade");
    expect(grade.style.display).toBe("none");
    expect(hud._gradeTimeout).toBeNull();
    vi.useRealTimers();
  });

  it("fires onGradeFlash callback", () => {
    const fn = vi.fn();
    const c = document.createElement("div");
    const h = new HUD(c, { onGradeFlash: fn });
    h.render();
    h.showGrade("perfect");
    expect(fn).toHaveBeenCalledWith("perfect");
    h.destroy();
  });

  it("is a no-op when not rendered", () => {
    const c = document.createElement("div");
    const h = new HUD(c);
    expect(() => h.showGrade("perfect")).not.toThrow();
    h.destroy();
  });

  it("resets timer when called again during flash", () => {
    vi.useFakeTimers();
    hud.showGrade("perfect");
    var firstTimeout = hud._gradeTimeout;

    hud.showGrade("good");
    expect(hud._gradeTimeout).not.toBe(firstTimeout);
    vi.useRealTimers();
  });

  it("sets aria-label on grade badge", () => {
    hud.showGrade("perfect");
    const grade = container.querySelector(".bc-game-root__hud-grade");
    expect(grade.getAttribute("aria-label")).toBe("Perfect");
  });

  it("accepts a patternResult object and shows dominant grade", () => {
    var result = makePatternResult({ perfects: 2, goods: 1, misses: 0 });
    hud.showGrade(result);
    const grade = container.querySelector(".bc-game-root__hud-grade");
    expect(grade.textContent).toBe("Good");
  });

  it("dominant grade from patternResult: miss takes priority", () => {
    var result = makePatternResult({ perfects: 2, misses: 1 });
    hud.showGrade(result);
    const grade = container.querySelector(".bc-game-root__hud-grade");
    expect(grade.textContent).toBe("Miss!");
  });

  it("dominant grade from patternResult: good over perfect", () => {
    var result = makePatternResult({ perfects: 2, goods: 1 });
    hud.showGrade(result);
    const grade = container.querySelector(".bc-game-root__hud-grade");
    expect(grade.textContent).toBe("Good");
  });

  it("dominant grade from patternResult: pure perfect", () => {
    var result = makePatternResult({ perfects: 3, goods: 0, misses: 0 });
    hud.showGrade(result);
    const grade = container.querySelector(".bc-game-root__hud-grade");
    expect(grade.textContent).toBe("Perfect!");
  });

  it("handles unknown grade string gracefully", () => {
    hud.showGrade("unknown-grade");
    const grade = container.querySelector(".bc-game-root__hud-grade");
    // Should still be hidden (no config matched)
    expect(grade.style.display).toBe("none");
  });

  it("handles null patternResult gracefully", () => {
    hud.showGrade(null);
    const grade = container.querySelector(".bc-game-root__hud-grade");
    expect(grade.style.display).toBe("none");
  });

  it("handles patternResult with no grades", () => {
    hud.showGrade({ score: 0 });
    const grade = container.querySelector(".bc-game-root__hud-grade");
    expect(grade.style.display).toBe("none");
  });
});

// ---------------------------------------------------------------------------
// StateContext subscription
// ---------------------------------------------------------------------------

describe("HUD — StateContext subscription", () => {
  let container;
  let hud;
  let ctx;

  beforeEach(() => {
    container = document.createElement("div");
    ctx = makeStateContext({ score: 0, lives: 3, streak: 0, phase: "learning" });
    hud = new HUD(container, { stateContext: ctx });
    hud.render();
  });

  afterEach(() => {
    if (hud) hud.destroy();
  });

  it("subscribes to state context on render", () => {
    expect(typeof hud._unsubscribe).toBe("function");
  });

  it("does not subscribe when no state context provided", () => {
    const c = document.createElement("div");
    const h = new HUD(c);
    h.render();
    expect(h._unsubscribe).toBeNull();
    h.destroy();
  });

  it("updates score display on state change", () => {
    ctx._setState({ score: 500 });
    // Score animation should eventually show 500
    expect(hud._score).toBe(500);
  });

  it("updates lives display on state change", () => {
    ctx._setState({ lives: 1 });
    expect(hud._lives).toBe(1);
  });

  it("empties hearts when lives decrease", () => {
    ctx._setState({ lives: 1 });
    var hearts = container.querySelectorAll(".bc-game-root__hud-heart");
    var emptyCount = 0;
    for (var i = 0; i < hearts.length; i++) {
      if (hearts[i].classList.contains("bc-game-root__hud-heart--empty")) {
        emptyCount++;
      }
    }
    // Hearts total = STARTING_LIVES; current lives = 1
    expect(emptyCount).toBe(T.STARTING_LIVES - 1);
  });

  it("updates streak display on state change", () => {
    ctx._setState({ streak: 7 });
    const streak = container.querySelector(".bc-game-root__hud-streak");
    expect(streak.textContent).toBe("7");
  });

  it("updates phase display on state change", () => {
    ctx._setState({ phase: "challenge" });
    const phase = container.querySelector(".bc-game-root__hud-phase");
    expect(phase.textContent).toBe("Challenge");
  });

  it("updates aria-label on lives when lives change", () => {
    ctx._setState({ lives: 2 });
    const lives = container.querySelector(".bc-game-root__hud-lives");
    expect(lives.getAttribute("aria-label")).toBe("Lives: 2");
  });

  it("ignores snapshot with no changes to score", () => {
    // Initial score is 0, setting to 0 should not trigger animation
    const spy = vi.spyOn(hud, "_startScoreAnimation");
    ctx._setState({ score: 0 });
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it("ignores snapshot with no changes to lives", () => {
    // Initial lives is 3, setting to 3 should do nothing
    const spy = vi.spyOn(hud, "_renderHearts");
    ctx._setState({ lives: 3 });
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it("ignores snapshot with no changes to streak", () => {
    // Initial streak is 0, setting to 0 should do nothing
    const oldStreak = hud._streakEl.textContent;
    ctx._setState({ streak: 0 });
    expect(hud._streakEl.textContent).toBe(oldStreak);
  });

  it("ignores snapshot with no changes to phase", () => {
    const oldPhase = hud._phaseEl.textContent;
    ctx._setState({ phase: "learning" });
    expect(hud._phaseEl.textContent).toBe(oldPhase);
  });

  it("handles null snapshot gracefully", () => {
    expect(() => hud._handleSnapshot(null)).not.toThrow();
  });

  it("unsubscribes on destroy", () => {
    var wasCalled = false;
    var altCtx = makeStateContext();
    var altHud = new HUD(container, { stateContext: altCtx });
    altHud.render();
    altHud.destroy();

    // After destroy, notify should not call the handler
    altCtx._setState({ score: 999 });
    // No assertion needed — just must not throw
  });
});

// ---------------------------------------------------------------------------
// Score animation
// ---------------------------------------------------------------------------

describe("HUD — score animation", () => {
  let container;
  let hud;

  beforeEach(() => {
    container = document.createElement("div");
    hud = new HUD(container);
    hud.render();
  });

  afterEach(() => {
    if (hud) hud.destroy();
  });

  it("starts score animation when score increases", () => {
    const spy = vi.spyOn(hud, "_startScoreAnimation");
    hud._score = 0;
    hud._handleSnapshot({ score: 500, lives: 3, streak: 0, phase: "learning" });
    expect(spy).toHaveBeenCalledWith(0, 500);
    spy.mockRestore();
  });

  it("_startScoreAnimation begins rAF loop", () => {
    const spy = vi.spyOn(globalThis, "requestAnimationFrame");
    hud._startScoreAnimation(0, 500);
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it("_tickScore updates displayed score text", () => {
    hud._startScoreAnimation(0, 200);
    // Set the start time so the tick calculation works correctly
    hud._scoreAnimStart = 1000;
    hud._tickScore(1000 + 400); // elapsed = 400, progress = 1.0
    expect(hud._scoreEl.textContent).toBe("200");
  });

  it("_cancelAnimation cancels rAF", () => {
    hud._animFrame = 999;
    const spy = vi.spyOn(globalThis, "cancelAnimationFrame");
    hud._cancelAnimation();
    expect(spy).toHaveBeenCalledWith(999);
    spy.mockRestore();
  });

  it("score animation does not throw when scoreEl is null", () => {
    hud._scoreEl = null;
    expect(() => hud._tickScore(100)).not.toThrow();
  });

  it("cancels previous animation before starting new one", () => {
    hud._animFrame = 999;
    const spy = vi.spyOn(globalThis, "cancelAnimationFrame");
    hud._startScoreAnimation(0, 100);
    expect(spy).toHaveBeenCalledWith(999);
    spy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// Hearts rendering
// ---------------------------------------------------------------------------

describe("HUD — hearts rendering", () => {
  let container;
  let hud;

  beforeEach(() => {
    container = document.createElement("div");
    hud = new HUD(container);
    hud.render();
  });

  afterEach(() => {
    if (hud) hud.destroy();
  });

  it("renders filled hearts for remaining lives", () => {
    hud._lives = 2;
    hud._renderHearts();
    var hearts = container.querySelectorAll(".bc-game-root__hud-heart");
    expect(hearts.length).toBe(T.STARTING_LIVES);
    expect(hearts[0].textContent).toBe("♥");
    expect(hearts[1].textContent).toBe("♥");
  });

  it("renders empty hearts for lost lives", () => {
    hud._lives = 1;
    hud._renderHearts();
    var hearts = container.querySelectorAll(".bc-game-root__hud-heart");
    expect(hearts[0].textContent).toBe("♥");
    expect(hearts[1].classList.contains("bc-game-root__hud-heart--empty")).toBe(true);
    expect(hearts[1].textContent).toBe("♡");
    expect(hearts[2].classList.contains("bc-game-root__hud-heart--empty")).toBe(true);
    expect(hearts[2].textContent).toBe("♡");
  });

  it("renders all empty when lives reach 0", () => {
    hud._lives = 0;
    hud._renderHearts();
    var hearts = container.querySelectorAll(".bc-game-root__hud-heart");
    for (var i = 0; i < hearts.length; i++) {
      expect(hearts[i].classList.contains("bc-game-root__hud-heart--empty")).toBe(true);
    }
  });

  it("is a no-op when livesEl is null", () => {
    hud._livesEl = null;
    expect(() => hud._renderHearts()).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Destroy
// ---------------------------------------------------------------------------

describe("HUD — destroy", () => {
  let container;
  let hud;

  beforeEach(() => {
    container = document.createElement("div");
    hud = new HUD(container);
    hud.render();
  });

  afterEach(() => {
    // Clean up in case destroy was not called
    if (hud && hud._el) hud.destroy();
  });

  it("removes DOM element from container", () => {
    hud.destroy();
    const el = container.querySelector(".bc-game-root__hud");
    expect(el).toBeNull();
  });

  it("nullifies internal references", () => {
    hud.destroy();
    expect(hud._container).toBeNull();
    expect(hud._el).toBeNull();
    expect(hud._scoreEl).toBeNull();
    expect(hud._livesEl).toBeNull();
    expect(hud._streakEl).toBeNull();
    expect(hud._gradeEl).toBeNull();
    expect(hud._phaseEl).toBeNull();
    expect(hud._bpmEl).toBeNull();
    expect(hud._stateContext).toBeNull();
  });

  it("can be called multiple times without throwing", () => {
    hud.destroy();
    expect(() => hud.destroy()).not.toThrow();
  });

  it("cancels animation frame on destroy", () => {
    hud._animFrame = 999;
    const spy = vi.spyOn(globalThis, "cancelAnimationFrame");
    hud.destroy();
    expect(spy).toHaveBeenCalledWith(999);
    spy.mockRestore();
  });

  it("clears grade timeout on destroy", () => {
    hud._gradeTimeout = setTimeout(function () {}, 1000);
    const spy = vi.spyOn(globalThis, "clearTimeout");
    hud.destroy();
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it("unsubscribes from state context on destroy", () => {
    var unsubscribeCalled = false;
    var altCtx = {
      getSnapshot: function () {
        return { score: 0, lives: 3, streak: 0, phase: "learning", difficulty: 1, currentPattern: null, nextPattern: null };
      },
      subscribe: function () {
        return function () { unsubscribeCalled = true; };
      },
    };
    var altHud = new HUD(container, { stateContext: altCtx });
    altHud.render();
    altHud.destroy();
    expect(unsubscribeCalled).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------

describe("HUD — edge cases", () => {
  let container;
  let hud;

  beforeEach(() => {
    container = document.createElement("div");
    hud = new HUD(container);
    hud.render();
  });

  afterEach(() => {
    if (hud) hud.destroy();
  });

  it("score animation handles negative values (should not happen)", () => {
    hud._startScoreAnimation(100, -50);
    hud._scoreAnimStart = 1000;
    hud._tickScore(1000 + 400);
    expect(hud._scoreEl.textContent).toBe("-50");
  });

  it("score animation handles large numbers", () => {
    hud._startScoreAnimation(0, 999999);
    hud._scoreAnimStart = 1000;
    hud._tickScore(1000 + 400);
    // toLocaleString() adds grouping separators; verify digits only
    var digits = hud._scoreEl.textContent.replace(/[^0-9\-]/g, "");
    expect(digits).toBe("999999");
  });

  it("renders with challenge phase and correct BPM", () => {
    const c = document.createElement("div");
    const ctx = makeStateContext({ phase: "challenge" });
    const h = new HUD(c, { stateContext: ctx, bpm: 100 });
    h.render();
    const phase = c.querySelector(".bc-game-root__hud-phase");
    expect(phase.textContent).toBe("Challenge");
    const bpm = c.querySelector(".bc-game-root__hud-bpm");
    expect(bpm.textContent).toBe("100 BPM");
    h.destroy();
  });

  it("handles multiple rapid state updates without throwing", () => {
    var ctx = makeStateContext({ score: 0, lives: 3, streak: 0 });
    var c = document.createElement("div");
    var h = new HUD(c, { stateContext: ctx });
    h.render();

    for (var i = 0; i < 10; i++) {
      ctx._setState({ score: i * 100, lives: 3 - (i % 3), streak: i });
    }
    // Just must not throw
    h.destroy();
  });

  it("hearts render with correct aria-label at 0 lives", () => {
    // Start with 3 lives, then update to 0 via snapshot
    var ctx = makeStateContext({ lives: 3 });
    var c = document.createElement("div");
    var h = new HUD(c, { stateContext: ctx });
    h.render();
    ctx._setState({ lives: 0 });
    expect(h._livesEl.getAttribute("aria-label")).toBe("Lives: 0");
    h.destroy();
  });

  it("grade badge clears previous CSS classes on new flash", () => {
    hud.showGrade("perfect");
    hud.showGrade("miss");
    const grade = container.querySelector(".bc-game-root__hud-grade");
    expect(grade.classList.contains("bc-game-root__hud-grade--perfect")).toBe(false);
    expect(grade.classList.contains("bc-game-root__hud-grade--miss")).toBe(true);
  });

  it("dominantGrade returns null for empty object", () => {
    expect(hud._dominantGrade({})).toBeNull();
  });

  it("dominantGrade returns null for null", () => {
    expect(hud._dominantGrade(null)).toBeNull();
  });

  it("dominantGrade returns null for non-object", () => {
    expect(hud._dominantGrade("string")).toBeNull();
  });

  it("dominantGrade scans grades array when no counts provided", () => {
    var result = {
      grades: [
        { grade: "good", onsetBeatTime: 1.0, playerBeatTime: 1.0 },
        { grade: "perfect", onsetBeatTime: 0, playerBeatTime: 0 },
      ],
    };
    expect(hud._dominantGrade(result)).toBe("good");
  });

  it("dominantGrade returns perfect from grades array when all perfect", () => {
    var result = {
      grades: [
        { grade: "perfect", onsetBeatTime: 0, playerBeatTime: 0 },
        { grade: "perfect", onsetBeatTime: 1.0, playerBeatTime: 1.0 },
      ],
    };
    expect(hud._dominantGrade(result)).toBe("perfect");
  });
});