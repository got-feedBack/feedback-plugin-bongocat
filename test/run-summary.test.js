import { describe, it, expect, beforeEach, afterEach } from "vitest";
import "../src/state-context.js";
import "../src/run-summary.js";

const StateContext = window.feedBackMinigamesFSM.StateContext;
const RunSummary = window.feedBackMinigamesRunSummary.RunSummary;

describe("RunSummary — namespace", () => {
  it("exposes RunSummary on window.feedBackMinigamesRunSummary", () => {
    expect(window.feedBackMinigamesRunSummary.RunSummary).toBe(RunSummary);
  });

  it("constructs a RunSummary instance", () => {
    const rs = new RunSummary(document.createElement("div"));
    expect(rs).toBeTruthy();
    expect(rs instanceof RunSummary).toBe(true);
    rs.destroy();
  });

  it("throws if no container given", () => {
    expect(() => new RunSummary()).toThrow();
  });
});

describe("RunSummary — rendering", () => {
  let container;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
  });

  afterEach(() => {
    if (container.parentNode) container.parentNode.removeChild(container);
  });

  function createSummary(opts) {
    const rs = new RunSummary(container, opts || {});
    rs.render();
    return rs;
  }

  it("renders title 'Run Complete'", () => {
    createSummary();
    const title = container.querySelector(".bc-game-root__summary-title");
    expect(title).not.toBeNull();
    expect(title.textContent).toBe("Run Complete");
  });

  it("renders default stat rows with zero values when no state or opts given", () => {
    createSummary();
    const statLabels = container.querySelectorAll(".bc-game-root__summary-stat-label");
    const statValues = container.querySelectorAll(".bc-game-root__summary-stat-value");

    expect(statLabels.length).toBeGreaterThanOrEqual(5);
    expect(statValues.length).toBeGreaterThanOrEqual(5);

    // Default values
    expect(statValues[0].textContent).toBe("0"); // Score
    expect(statValues[3].textContent).toMatch(/0%/); // Accuracy
    expect(statValues[4].textContent).toBe("0"); // Best streak
  });

  it("renders score from snapshot", () => {
    const ctx = new StateContext();
    ctx.score = 4500;
    createSummary({ stateContext: ctx });
    const values = container.querySelectorAll(".bc-game-root__summary-stat-value");
    // toLocaleString() output depends on environment locale — verify digits only
    var digits = values[0].textContent.replace(/[^0-9\-]/g, "");
    expect(digits).toBe("4500");
  });

  it("renders custom patternsSurvived from opts", () => {
    createSummary({ patternsSurvived: 12 });
    const values = container.querySelectorAll(".bc-game-root__summary-stat-value");
    expect(values[2].textContent).toBe("12"); // Patterns Survived
  });

  it("renders custom accuracy from opts", () => {
    createSummary({ accuracy: 87.3 });
    const values = container.querySelectorAll(".bc-game-root__summary-stat-value");
    expect(values[3].textContent).toBe("87%"); // Accuracy
  });

  it("clamps accuracy between 0 and 100", () => {
    const rs = new RunSummary(container, { accuracy: 150 });
    expect(rs._accuracy).toBe(100);
    rs.destroy();

    const rs2 = new RunSummary(container, { accuracy: -10 });
    expect(rs2._accuracy).toBe(0);
    rs2.destroy();
  });

  it("renders best streak from snapshot", () => {
    const ctx = new StateContext();
    ctx.streak = 14;
    createSummary({ stateContext: ctx });
    const values = container.querySelectorAll(".bc-game-root__summary-stat-value");
    expect(values[4].textContent).toBe("14"); // Best streak
  });

  it("renders mode from snapshot phase", () => {
    const ctx = new StateContext({ phase: "challenge" });
    createSummary({ stateContext: ctx });
    const labels = container.querySelectorAll(".bc-game-root__summary-stat-label");
    const values = container.querySelectorAll(".bc-game-root__summary-stat-value");
    // Mode is the last stat row
    const modeIdx = labels.length - 1;
    expect(labels[modeIdx].textContent).toBe("Mode");
    expect(values[modeIdx].textContent).toBe("Challenge");
  });

  it("defaults to Learning mode when snapshot phase is absent", () => {
    createSummary();
    const labels = container.querySelectorAll(".bc-game-root__summary-stat-label");
    const values = container.querySelectorAll(".bc-game-root__summary-stat-value");
    const modeIdx = labels.length - 1;
    expect(values[modeIdx].textContent).toBe("Learning");
  });

  it("renders Play Again and Exit buttons", () => {
    createSummary();
    const btns = container.querySelectorAll(".bc-game-root__summary-btn");
    expect(btns.length).toBe(2);
    expect(btns[0].textContent).toBe("Play Again");
    expect(btns[1].textContent).toBe("Exit");
  });

  it("has aria-live region with summary announcement", () => {
    createSummary({ accuracy: 92, patternsSurvived: 8 });
    const live = container.querySelector(".bc-game-root__aria-live");
    expect(live).not.toBeNull();
    expect(live.getAttribute("aria-live")).toBe("polite");
    expect(live.textContent).toContain("Run complete");
    expect(live.textContent).toContain("Score");
    expect(live.textContent).toContain("Accuracy");
  });

  it("Play Again button fires onPlayAgain callback", () => {
    let fired = false;
    createSummary({ onPlayAgain: () => { fired = true; } });
    const btns = container.querySelectorAll(".bc-game-root__summary-btn");
    btns[0].click();
    expect(fired).toBe(true);
  });

  it("Exit button fires onExit callback", () => {
    let fired = false;
    createSummary({ onExit: () => { fired = true; } });
    const btns = container.querySelectorAll(".bc-game-root__summary-btn");
    btns[1].click();
    expect(fired).toBe(true);
  });

  it("does not crash if onPlayAgain is not provided", () => {
    createSummary();
    const btns = container.querySelectorAll(".bc-game-root__summary-btn");
    expect(() => btns[0].click()).not.toThrow();
  });

  it("does not crash if onExit is not provided", () => {
    createSummary();
    const btns = container.querySelectorAll(".bc-game-root__summary-btn");
    expect(() => btns[1].click()).not.toThrow();
  });

  it("re-renders on second render() call (idempotent)", () => {
    const rs = createSummary();
    const initialBtns = container.querySelectorAll(".bc-game-root__summary-btn").length;
    rs.render();
    const afterBtns = container.querySelectorAll(".bc-game-root__summary-btn").length;
    // Should still have exactly one set of buttons (old DOM removed)
    expect(afterBtns).toBe(initialBtns);
    rs.destroy();
  });
});

describe("RunSummary — grade calculation", () => {
  let container;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
  });

  afterEach(() => {
    if (container.parentNode) container.parentNode.removeChild(container);
  });

  it("grade S for accuracy >= 95", () => {
    const rs = new RunSummary(container, { accuracy: 97 });
    rs.render();
    const row = container.querySelector(".bc-game-root__summary-grade--s");
    expect(row).not.toBeNull();
    const value = row.querySelector(".bc-game-root__summary-stat-value");
    expect(value.textContent).toContain("S");
    rs.destroy();
  });

  it("grade A for accuracy 85-94", () => {
    const rs = new RunSummary(container, { accuracy: 85 });
    rs.render();
    const row = container.querySelector(".bc-game-root__summary-grade--a");
    expect(row).not.toBeNull();
    const value = row.querySelector(".bc-game-root__summary-stat-value");
    expect(value.textContent).toContain("A");
    rs.destroy();
  });

  it("grade B for accuracy 70-84", () => {
    const rs = new RunSummary(container, { accuracy: 72 });
    rs.render();
    const row = container.querySelector(".bc-game-root__summary-grade--b");
    expect(row).not.toBeNull();
    const value = row.querySelector(".bc-game-root__summary-stat-value");
    expect(value.textContent).toContain("B");
    rs.destroy();
  });

  it("grade C for accuracy 50-69", () => {
    const rs = new RunSummary(container, { accuracy: 55 });
    rs.render();
    const row = container.querySelector(".bc-game-root__summary-grade--c");
    expect(row).not.toBeNull();
    const value = row.querySelector(".bc-game-root__summary-stat-value");
    expect(value.textContent).toContain("C");
    rs.destroy();
  });

  it("grade D for accuracy < 50", () => {
    const rs = new RunSummary(container, { accuracy: 33 });
    rs.render();
    const row = container.querySelector(".bc-game-root__summary-grade--d");
    expect(row).not.toBeNull();
    const value = row.querySelector(".bc-game-root__summary-stat-value");
    expect(value.textContent).toContain("D");
    rs.destroy();
  });

  it("grade D for accuracy 0", () => {
    const rs = new RunSummary(container, { accuracy: 0 });
    rs.render();
    const row = container.querySelector(".bc-game-root__summary-grade--d");
    expect(row).not.toBeNull();
    rs.destroy();
  });

  it("grade S for accuracy 100", () => {
    const rs = new RunSummary(container, { accuracy: 100 });
    rs.render();
    const row = container.querySelector(".bc-game-root__summary-grade--s");
    expect(row).not.toBeNull();
    rs.destroy();
  });

  it("grade D when accuracy is NaN (defaults to 0)", () => {
    const rs = new RunSummary(container, { accuracy: NaN });
    expect(rs._accuracy).toBe(0);
    rs.render();
    const row = container.querySelector(".bc-game-root__summary-grade--d");
    expect(row).not.toBeNull();
    rs.destroy();
  });
});

describe("RunSummary — destroy", () => {
  let container;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
  });

  afterEach(() => {
    if (container.parentNode) container.parentNode.removeChild(container);
  });

  it("removes DOM elements from container", () => {
    const rs = new RunSummary(container, {});
    rs.render();
    expect(container.children.length).toBe(1);
    rs.destroy();
    expect(container.children.length).toBe(0);
  });

  it("is safe to call destroy before render", () => {
    const rs = new RunSummary(container, {});
    expect(() => rs.destroy()).not.toThrow();
  });

  it("is safe to call destroy multiple times", () => {
    const rs = new RunSummary(container, {});
    rs.render();
    rs.destroy();
    expect(() => rs.destroy()).not.toThrow();
  });
});

describe("RunSummary — integration with StateContext", () => {
  let container;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
  });

  afterEach(() => {
    if (container.parentNode) container.parentNode.removeChild(container);
  });

  it("reads score, streak, phase, difficulty from snapshot", () => {
    const ctx = new StateContext({ startingLives: 3, phase: "challenge" });
    ctx.score = 8750;
    ctx.streak = 22;
    ctx.difficulty = 7;

    const rs = new RunSummary(container, {
      stateContext: ctx,
      patternsSurvived: 18,
      accuracy: 91.5,
    });
    rs.render();

    const values = container.querySelectorAll(".bc-game-root__summary-stat-value");
    // Score: 8750 (strip locale-specific grouping)
    var scoreDigits = values[0].textContent.replace(/[^0-9\-]/g, "");
    expect(scoreDigits).toBe("8750");
    // Patterns: 18
    expect(values[2].textContent).toBe("18");
    // Accuracy: 92%
    expect(values[3].textContent).toBe("92%");
    // Streak: 22
    expect(values[4].textContent).toBe("22");
    // Grade row has "A" badge
    const gradeRow = container.querySelector(".bc-game-root__summary-grade--a");
    expect(gradeRow).not.toBeNull();

    rs.destroy();
  });

  it("works with null stateContext (uses defaults)", () => {
    const rs = new RunSummary(container, { stateContext: null });
    rs.render();
    const title = container.querySelector(".bc-game-root__summary-title");
    expect(title).not.toBeNull();
    const values = container.querySelectorAll(".bc-game-root__summary-stat-value");
    expect(values[0].textContent).toBe("0");
    rs.destroy();
  });
});