import { describe, it, expect, beforeEach, afterEach } from "vitest";
import "../src/state-context.js";
import "../src/fsm.js";

const StateContext = window.feedBackMinigamesFSM.StateContext;
const FSM = window.feedBackMinigamesFSM.FSM;
const STATES = FSM.STATES;

describe("StateContext", () => {
  it("starts with default values", () => {
    const ctx = new StateContext();
    expect(ctx.score).toBe(0);
    expect(ctx.lives).toBe(3);
    expect(ctx.streak).toBe(0);
    expect(ctx.difficulty).toBe(1);
    expect(ctx.phase).toBe("learning");
  });

  it("getSnapshot returns a copy", () => {
    const ctx = new StateContext({ phase: "challenge" });
    const snap = ctx.getSnapshot();
    expect(snap.phase).toBe("challenge");
    snap.score = 999;
    expect(ctx.score).toBe(0);
  });

  it("subscribe notifies listeners on reset", () => {
    const ctx = new StateContext();
    let notified = false;
    ctx.subscribe(() => { notified = true; });
    ctx.reset("challenge");
    expect(notified).toBe(true);
  });

  it("unsubscribe stops notifications", () => {
    const ctx = new StateContext();
    let count = 0;
    const unsub = ctx.subscribe(() => { count++; });
    unsub();
    ctx.reset("learning");
    expect(count).toBe(0);
  });
});

describe("FSM", () => {
  let ctx;
  let fsm;
  let transitions;

  beforeEach(() => {
    ctx = new StateContext({ startingLives: 3 });
    transitions = [];
    fsm = new FSM(ctx, {
      beatClock: { isRunning: () => true },
      generatePattern: (diff) => ({ difficulty: diff, slots: [] }),
      onTransition: (from, to) => { transitions.push({ from, to }); },
    });
  });

  afterEach(() => {
    fsm.reset();
  });

  it("starts in Setup state", () => {
    expect(fsm.getState()).toBe(STATES.SETUP);
  });

  it("startRun transitions to CountIn", () => {
    const ok = fsm.startRun("learning");
    expect(ok).toBe(true);
    expect(fsm.getState()).toBe(STATES.COUNT_IN);
  });

  it("startRun returns false when beat clock not running", () => {
    const fsm2 = new FSM(ctx, {
      beatClock: { isRunning: () => false },
    });
    const ok = fsm2.startRun("learning");
    expect(ok).toBe(false);
    expect(fsm2.getState()).toBe(STATES.SETUP);
  });

  it("completeCountIn → Demo in Learning mode", () => {
    fsm.startRun("learning");
    fsm.completeCountIn();
    expect(fsm.getState()).toBe(STATES.DEMO);
  });

  it("completeCountIn → Response in Challenge mode", () => {
    fsm.startRun("challenge");
    fsm.completeCountIn();
    expect(fsm.getState()).toBe(STATES.RESPONSE);
  });

  it("completeDemo → Response", () => {
    fsm.startRun("learning");
    fsm.completeCountIn();
    fsm.completeDemo();
    expect(fsm.getState()).toBe(STATES.RESPONSE);
  });

  it("handlePatternResult → Demo in Learning mode (lives > 0)", () => {
    fsm.startRun("learning");
    fsm.completeCountIn();
    fsm.completeDemo();
    fsm.handlePatternResult({ clean: true, misses: 0, score: 100 });
    expect(fsm.getState()).toBe(STATES.DEMO);
  });

  it("handlePatternResult → Response in Challenge mode (lives > 0)", () => {
    fsm.startRun("challenge");
    fsm.completeCountIn();
    fsm.handlePatternResult({ clean: true, misses: 0, score: 100 });
    expect(fsm.getState()).toBe(STATES.RESPONSE);
  });

  it("handlePatternResult → Summary when lives reach 0", () => {
    fsm.startRun("learning");
    ctx.lives = 1; // set after startRun so reset() doesn't overwrite
    fsm.completeCountIn();
    fsm.completeDemo();
    // Learning mode: 2+ misses = 1 life lost → lives = 0 → Summary
    fsm.handlePatternResult({ clean: false, misses: 2, score: 0 });
    expect(fsm.getState()).toBe(STATES.SUMMARY);
  });

  it("goToSummary transitions to Summary", () => {
    fsm.startRun("learning");
    fsm.goToSummary();
    expect(fsm.getState()).toBe(STATES.SUMMARY);
  });

  it("playAgain transitions from Summary to Setup", () => {
    fsm.startRun("learning");
    fsm.goToSummary();
    fsm.playAgain();
    expect(fsm.getState()).toBe(STATES.SETUP);
  });

  it("handlePatternResult updates score and lives", () => {
    fsm.startRun("learning");
    fsm.completeCountIn();
    fsm.completeDemo();
    fsm.handlePatternResult({ clean: true, misses: 0, score: 200 });
    expect(ctx.score).toBe(200);
    expect(ctx.lives).toBe(3); // no misses
  });

  it("handlePatternResult decrements lives on miss", () => {
    fsm.startRun("learning");
    fsm.completeCountIn();
    fsm.completeDemo();
    // Learning mode: 2+ misses = 1 life lost
    fsm.handlePatternResult({ clean: false, misses: 2, score: 0 });
    expect(ctx.lives).toBe(2);
  });

  it("handlePatternResult updates streak on clean", () => {
    fsm.startRun("learning");
    fsm.completeCountIn();
    fsm.completeDemo();
    fsm.handlePatternResult({ clean: true, misses: 0, score: 100 });
    expect(ctx.streak).toBe(1);
  });

  it("handlePatternResult resets streak on non-clean", () => {
    ctx.streak = 5;
    fsm.startRun("learning");
    fsm.completeCountIn();
    fsm.completeDemo();
    fsm.handlePatternResult({ clean: false, misses: 1, score: 0 });
    expect(ctx.streak).toBe(0);
  });

  it("handlePatternResult increases difficulty on 3 consecutive clean patterns", () => {
    fsm.startRun("learning");
    ctx.difficulty = 1; // set after startRun so reset() doesn't overwrite
    fsm.completeCountIn();
    fsm.completeDemo();
    // Learning mode: 3 consecutive clean patterns needed to advance.
    // Between each pattern result, the FSM cycles Demo → Response.
    fsm.handlePatternResult({ clean: true, misses: 0, score: 100 });
    expect(ctx.difficulty).toBe(1); // 1st clean: not yet
    fsm.completeDemo();
    fsm.handlePatternResult({ clean: true, misses: 0, score: 100 });
    expect(ctx.difficulty).toBe(1); // 2nd clean: not yet
    fsm.completeDemo();
    fsm.handlePatternResult({ clean: true, misses: 0, score: 100 });
    expect(ctx.difficulty).toBe(2); // 3rd clean: advance
  });

  it("handlePatternResult decreases difficulty on miss", () => {
    fsm.startRun("learning");
    ctx.difficulty = 5; // set after startRun so reset() doesn't overwrite
    fsm.completeCountIn();
    fsm.completeDemo();
    // Learning mode: 2+ misses = lower difficulty
    fsm.handlePatternResult({ clean: false, misses: 2, score: 0 });
    expect(ctx.difficulty).toBe(4);
  });

  it("onTransition fires on every state change", () => {
    fsm.startRun("learning");
    fsm.completeCountIn();
    fsm.completeDemo();
    expect(transitions.length).toBeGreaterThanOrEqual(3);
    expect(transitions[0].from).toBe("Setup");
    expect(transitions[0].to).toBe("CountIn");
  });

  it("one-pattern lookahead: nextPattern populated on startRun", () => {
    fsm.startRun("learning");
    expect(ctx.currentPattern).not.toBeNull();
    expect(ctx.nextPattern).not.toBeNull();
  });

  it("reset goes back to Setup", () => {
    fsm.startRun("learning");
    fsm.reset();
    expect(fsm.getState()).toBe(STATES.SETUP);
  });
});