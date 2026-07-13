import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import "../src/tunables.js";
import "../src/judge.js";
import "../src/cat-expressions.js";

const CatExpressions = window.feedBackMinigamesCatExpressions.CatExpressions;
const Judge = window.feedBackMinigamesJudge.Judge;
const EXPRESSION = CatExpressions.EXPRESSION || {};

describe("CatExpressions — construction", () => {
  it("is exposed on window", () => {
    expect(CatExpressions).toBeTruthy();
  });

  it("has EXPRESSION enum with five states", () => {
    expect(EXPRESSION.IDLE).toBe("idle");
    expect(EXPRESSION.FOCUSING).toBe("focusing");
    expect(EXPRESSION.HAPPY).toBe("happy");
    expect(EXPRESSION.GOOD).toBe("good");
    expect(EXPRESSION.SAD).toBe("sad");
  });

  it("throws without a container", () => {
    expect(() => new CatExpressions()).toThrow();
  });

  it("constructs with a container element", () => {
    const container = document.createElement("div");
    const expr = new CatExpressions(container);
    expect(expr).toBeTruthy();
    expect(expr.getExpression()).toBe("idle");
    expr.destroy();
  });

  it("accepts opts.autoRevertMs override", () => {
    const container = document.createElement("div");
    const expr = new CatExpressions(container, { autoRevertMs: 1200 });
    expect(expr._autoRevertMs).toBe(1200);
    expr.destroy();
  });

  it("accepts opts.onExpressionChange callback", () => {
    const container = document.createElement("div");
    const fn = vi.fn();
    const expr = new CatExpressions(container, { onExpressionChange: fn });
    expect(expr._onExpressionChange).toBe(fn);
    expr.destroy();
  });

  it("accepts opts.judge and hooks into it", () => {
    const container = document.createElement("div");
    const judge = new Judge();
    const expr = new CatExpressions(container, { judge });
    // The judge's _onResult should now be the wrapped function
    expect(typeof judge._onResult).toBe("function");
    expr.destroy();
  });
});

describe("CatExpressions — render", () => {
  let container;
  let expr;

  beforeEach(() => {
    container = document.createElement("div");
    expr = new CatExpressions(container);
  });

  afterEach(() => {
    if (expr) expr.destroy();
  });

  it("appends DOM to container", () => {
    expr.render();
    const el = container.querySelector(".bc-game-root__cat-expressions");
    expect(el).toBeTruthy();
  });

  it("creates face element", () => {
    expr.render();
    const face = container.querySelector(".bc-game-root__cat-expressions-face");
    expect(face).toBeTruthy();
    expect(face.textContent).toBe("( o.o )");
  });

  it("creates label element", () => {
    expr.render();
    const label = container.querySelector(".bc-game-root__cat-expressions-label");
    expect(label).toBeTruthy();
    expect(label.getAttribute("aria-live")).toBe("polite");
  });

  it("is idempotent — second render does not duplicate DOM", () => {
    expr.render();
    expr.render();
    const els = container.querySelectorAll(".bc-game-root__cat-expressions");
    expect(els.length).toBe(1);
  });

  it("sets initial state class to idle", () => {
    expr.render();
    const el = container.querySelector(".bc-game-root__cat-expressions");
    expect(el.classList.contains("bc-game-root__cat-expressions--idle")).toBe(true);
  });
});

describe("CatExpressions — setExpression", () => {
  let container;
  let expr;

  beforeEach(() => {
    container = document.createElement("div");
    expr = new CatExpressions(container);
    expr.render();
  });

  afterEach(() => {
    expr.destroy();
  });

  it("changes expression from idle to happy", () => {
    expr.setExpression("happy");
    expect(expr.getExpression()).toBe("happy");
  });

  it("updates face text content", () => {
    expr.setExpression("happy");
    const face = container.querySelector(".bc-game-root__cat-expressions-face");
    expect(face.textContent).toBe("( ^.^ )");
  });

  it("updates state class on the root element", () => {
    expr.setExpression("happy");
    const el = container.querySelector(".bc-game-root__cat-expressions");
    expect(el.classList.contains("bc-game-root__cat-expressions--happy")).toBe(true);
    expect(el.classList.contains("bc-game-root__cat-expressions--idle")).toBe(false);
  });

  it("updates aria label", () => {
    expr.setExpression("happy");
    const label = container.querySelector(".bc-game-root__cat-expressions-label");
    expect(label.textContent).toBe("Perfect! Bongo Cat is happy");
  });

  it("removes previous state class when changing", () => {
    expr.setExpression("happy");
    expr.setExpression("sad");
    const el = container.querySelector(".bc-game-root__cat-expressions");
    expect(el.classList.contains("bc-game-root__cat-expressions--sad")).toBe(true);
    expect(el.classList.contains("bc-game-root__cat-expressions--happy")).toBe(false);
  });

  it("does nothing for unknown expression", () => {
    expr.setExpression("unknown");
    expect(expr.getExpression()).toBe("idle");
  });

  it("is a no-op when setting same expression", () => {
    const fn = vi.fn();
    expr._onExpressionChange = fn;
    expr.setExpression("idle");
    expect(fn).not.toHaveBeenCalled();
  });

  it("fires onExpressionChange callback", () => {
    const fn = vi.fn();
    expr._onExpressionChange = fn;
    expr.setExpression("focusing");
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith("idle", "focusing");
  });
});

describe("CatExpressions — handleGrade", () => {
  let container;
  let expr;

  beforeEach(() => {
    vi.useFakeTimers();
    container = document.createElement("div");
    expr = new CatExpressions(container, { autoRevertMs: 500 });
    expr.render();
  });

  afterEach(() => {
    expr.destroy();
    vi.useRealTimers();
  });

  it("maps 'perfect' to happy", () => {
    expr.handleGrade("perfect");
    expect(expr.getExpression()).toBe("happy");
  });

  it("maps 'good' to good", () => {
    expr.handleGrade("good");
    expect(expr.getExpression()).toBe("good");
  });

  it("maps 'miss' to sad", () => {
    expr.handleGrade("miss");
    expect(expr.getExpression()).toBe("sad");
  });

  it("maps 'miss-extra' to sad", () => {
    expr.handleGrade("miss-extra");
    expect(expr.getExpression()).toBe("sad");
  });

  it("ignores unknown grade", () => {
    expr.handleGrade("unknown");
    expect(expr.getExpression()).toBe("idle");
  });

  it("auto-reverts to focusing after delay", () => {
    expr.handleGrade("perfect");
    expect(expr.getExpression()).toBe("happy");

    vi.advanceTimersByTime(500);
    expect(expr.getExpression()).toBe("focusing");
  });

  it("cancels previous revert timer on new grade", () => {
    expr.handleGrade("perfect");
    vi.advanceTimersByTime(200);
    expr.handleGrade("good");
    // Should still be "good" since we reset the timer
    expect(expr.getExpression()).toBe("good");

    vi.advanceTimersByTime(500);
    // Should have reverted to focusing (500ms from the second call)
    expect(expr.getExpression()).toBe("focusing");
  });
});

describe("CatExpressions — handlePatternResult", () => {
  let container;
  let expr;

  beforeEach(() => {
    vi.useFakeTimers();
    container = document.createElement("div");
    expr = new CatExpressions(container, { autoRevertMs: 500 });
    expr.render();
  });

  afterEach(() => {
    expr.destroy();
    vi.useRealTimers();
  });

  it("ignores null result", () => {
    expr.handlePatternResult(null);
    expect(expr.getExpression()).toBe("idle");
  });

  it("ignores result with empty grades", () => {
    expr.handlePatternResult({ grades: [] });
    expect(expr.getExpression()).toBe("idle");
  });

  it("shows happy for all perfects", () => {
    expr.handlePatternResult({
      grades: [
        { grade: "perfect", onsetBeatTime: 0, playerBeatTime: 0 },
        { grade: "perfect", onsetBeatTime: 1, playerBeatTime: 1 },
      ],
    });
    expect(expr.getExpression()).toBe("happy");
  });

  it("shows good when mixed perfects and goods", () => {
    expr.handlePatternResult({
      grades: [
        { grade: "perfect", onsetBeatTime: 0, playerBeatTime: 0 },
        { grade: "good", onsetBeatTime: 1, playerBeatTime: 1.05 },
      ],
    });
    expect(expr.getExpression()).toBe("good");
  });

  it("shows sad when any miss is present", () => {
    expr.handlePatternResult({
      grades: [
        { grade: "perfect", onsetBeatTime: 0, playerBeatTime: 0 },
        { grade: "miss", onsetBeatTime: 1, playerBeatTime: null },
      ],
    });
    expect(expr.getExpression()).toBe("sad");
  });

  it("shows sad for miss-extra", () => {
    expr.handlePatternResult({
      grades: [
        { grade: "perfect", onsetBeatTime: 0, playerBeatTime: 0 },
        { grade: "miss-extra", onsetBeatTime: null, playerBeatTime: 2.5 },
      ],
    });
    expect(expr.getExpression()).toBe("sad");
  });

  it("auto-reverts to focusing after delay", () => {
    expr.handlePatternResult({
      grades: [
        { grade: "perfect", onsetBeatTime: 0, playerBeatTime: 0 },
      ],
    });
    expect(expr.getExpression()).toBe("happy");

    vi.advanceTimersByTime(500);
    expect(expr.getExpression()).toBe("focusing");
  });
});

describe("CatExpressions — focus / reset", () => {
  let container;
  let expr;

  beforeEach(() => {
    vi.useFakeTimers();
    container = document.createElement("div");
    expr = new CatExpressions(container, { autoRevertMs: 500 });
    expr.render();
  });

  afterEach(() => {
    expr.destroy();
    vi.useRealTimers();
  });

  it("focus sets expression to focusing", () => {
    expr.focus();
    expect(expr.getExpression()).toBe("focusing");
  });

  it("reset sets expression to idle", () => {
    expr.setExpression("happy");
    expr.reset();
    expect(expr.getExpression()).toBe("idle");
  });

  it("focus cancels any pending revert timer", () => {
    expr.handleGrade("perfect");
    expect(expr._revertTimer).not.toBeNull();

    expr.focus();
    expect(expr._revertTimer).toBeNull();
    expect(expr.getExpression()).toBe("focusing");
  });

  it("reset cancels any pending revert timer", () => {
    expr.handleGrade("perfect");
    expect(expr._revertTimer).not.toBeNull();

    expr.reset();
    expect(expr._revertTimer).toBeNull();
    expect(expr.getExpression()).toBe("idle");
  });
});

describe("CatExpressions — judge integration", () => {
  let container;
  let judge;
  let expr;

  beforeEach(() => {
    container = document.createElement("div");
    judge = new Judge({ bpm: 120 });
    expr = new CatExpressions(container, { judge });
    expr.render();
  });

  afterEach(() => {
    expr.destroy();
  });

  it("hooks into judge and reacts to gradePattern", () => {
    // When judge grades a pattern with all perfects, expression should become happy
    const onsets = [
      { beatTime: 0.0 },
      { beatTime: 1.0 },
    ];
    const pattern = {
      expectedOnsets: [0.0, 1.0],
    };

    judge.gradePattern(onsets, pattern);

    expect(expr.getExpression()).toBe("happy");
  });

  it("reacts to pattern with misses as sad", () => {
    // Only one onset, second expected onset is missed
    const onsets = [
      { beatTime: 0.0 },
    ];
    const pattern = {
      expectedOnsets: [0.0, 1.0],
    };

    judge.gradePattern(onsets, pattern);

    expect(expr.getExpression()).toBe("sad");
  });

  it("preserves a pre-existing onResult callback", () => {
    const existingFn = vi.fn();
    const customJudge = new Judge({ bpm: 120, onResult: existingFn });
    const customExpr = new CatExpressions(container, { judge: customJudge });
    customExpr.render();

    const onsets = [
      { beatTime: 0.0 },
    ];
    const pattern = {
      expectedOnsets: [0.0],
    };

    customJudge.gradePattern(onsets, pattern);

    // Expression should update
    expect(customExpr.getExpression()).toBe("happy");
    // Existing callback should still be called
    expect(existingFn).toHaveBeenCalledTimes(1);

    customExpr.destroy();
  });
});

describe("CatExpressions — destroy", () => {
  let container;
  let expr;

  beforeEach(() => {
    container = document.createElement("div");
    expr = new CatExpressions(container);
    expr.render();
  });

  it("removes DOM from container", () => {
    expect(container.children.length).toBe(1);
    expr.destroy();
    expect(container.children.length).toBe(0);
  });

  it("nullifies internal references", () => {
    expr.destroy();
    expect(expr._container).toBeNull();
    expect(expr._el).toBeNull();
    expect(expr._faceEl).toBeNull();
    expect(expr._labelEl).toBeNull();
    expect(expr._onExpressionChange).toBeNull();
  });

  it("cancels pending revert timer", () => {
    vi.useFakeTimers();
    expr.handleGrade("perfect");
    expect(expr._revertTimer).not.toBeNull();

    expr.destroy();
    expect(expr._revertTimer).toBeNull();
    vi.useRealTimers();
  });

  it("is safe to call multiple times", () => {
    expr.destroy();
    expect(() => expr.destroy()).not.toThrow();
  });
});

describe("CatExpressions — edge cases", () => {
  let container;
  let expr;

  beforeEach(() => {
    container = document.createElement("div");
    expr = new CatExpressions(container);
  });

  afterEach(() => {
    expr.destroy();
  });

  it("getExpression returns idle before any set call", () => {
    expect(expr.getExpression()).toBe("idle");
  });

  it("handleGrade with null grade does not crash", () => {
    expect(() => expr.handleGrade(null)).not.toThrow();
  });

  it("handleGrade with undefined grade does not crash", () => {
    expect(() => expr.handleGrade(undefined)).not.toThrow();
  });

  it("handlePatternResult with non-object does not crash", () => {
    expect(() => expr.handlePatternResult(undefined)).not.toThrow();
    expect(() => expr.handlePatternResult("string")).not.toThrow();
  });

  it("setExpression does not crash before render", () => {
    expect(() => expr.setExpression("happy")).not.toThrow();
    // Expression is tracked, but DOM not built yet
    expect(expr.getExpression()).toBe("happy");
  });

  it("renders correctly after setExpression before render", () => {
    expr.setExpression("focusing");
    expr.render();
    const face = container.querySelector(".bc-game-root__cat-expressions-face");
    expect(face.textContent).toBe("( >.< )");
    const el = container.querySelector(".bc-game-root__cat-expressions");
    expect(el.classList.contains("bc-game-root__cat-expressions--focusing")).toBe(true);
  });
});