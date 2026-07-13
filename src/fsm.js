(function () {
  "use strict";

  var STATES = {
    SETUP: "Setup",
    COUNT_IN: "CountIn",
    DEMO: "Demo",
    RESPONSE: "Response",
    SUMMARY: "Summary",
  };

  var Scoring = window.feedBackMinigamesScoring && window.feedBackMinigamesScoring.Scoring;

  function FSM(ctx, opts) {
    opts = opts || {};
    this._ctx = ctx;
    this._beatClock = opts.beatClock || null;
    this._onTransition = opts.onTransition || null;
    this._generatePattern = opts.generatePattern || null;
    this._scoring = opts.scoring || (Scoring ? new Scoring() : null);
    this._challengeMissCounter = 0;
    this._state = STATES.SETUP;
  }

  FSM.prototype.getState = function () {
    return this._state;
  };

  FSM.prototype.getContext = function () {
    return this._ctx;
  };

  // Setup → CountIn (on "Start Run" click)
  FSM.prototype.startRun = function (phase) {
    if (this._state !== STATES.SETUP) return false;
    if (this._beatClock && !this._beatClock.isRunning()) return false;

    this._ctx.reset(phase);
    this._ctx.currentPattern = this._generatePattern ? this._generatePattern(this._ctx.difficulty) : null;
    this._ctx.nextPattern = this._generatePattern ? this._generatePattern(this._ctx.difficulty + 1) : null;

    this._transition(STATES.COUNT_IN);
    return true;
  };

  // CountIn → Demo/Response (on count-in complete)
  FSM.prototype.completeCountIn = function () {
    if (this._state !== STATES.COUNT_IN) return;
    if (this._ctx.phase === "challenge") {
      this._transition(STATES.RESPONSE);
    } else {
      this._transition(STATES.DEMO);
    }
  };

  // Demo → Response (on demo playback complete)
  FSM.prototype.completeDemo = function () {
    if (this._state !== STATES.DEMO) return;
    this._transition(STATES.RESPONSE);
  };

  // Handle patternResult from Judge
  FSM.prototype.handlePatternResult = function (result) {
    if (this._state !== STATES.RESPONSE) return;

    result = result || {};
    var perfects = result.perfects || 0;
    var goods = result.goods || 0;
    var misses = result.misses || 0;
    var extras = result.extras || 0;
    var totalMisses = misses + extras;
    var clean = result.clean === true;

    // Move currentPattern → done, nextPattern → current
    this._ctx.currentPattern = this._ctx.nextPattern;
    this._ctx.nextPattern = this._generatePattern
      ? this._generatePattern(this._ctx.difficulty + 1)
      : null;

    // --- Score calculation (using scoring module) ---
    var bpm = (this._beatClock && typeof this._beatClock.getBpm === "function")
      ? this._beatClock.getBpm() : 80;
    if (this._scoring) {
      // Use current streak (before increment) for multiplier
      var patternScore = this._scoring.calculateScore(perfects, goods, this._ctx.streak, bpm);
      this._ctx.score += patternScore;
    } else {
      // Fallback: raw score from Judge
      this._ctx.score += result.score || 0;
    }

    // --- Streak update ---
    // Streak increments on clean patternResult (zero misses + zero extras);
    // resets to 0 on any miss or extra.
    if (clean) {
      this._ctx.streak++;
    } else {
      this._ctx.streak = 0;
    }

    // --- Life drain (phase-specific) ---
    // Drain counts missed SLOTS, not missed onsets: whiffing all four
    // sixteenths of one slot is one mistake. Extras never drain lives
    // (they already break the streak via `clean`).
    var missedSlots = (typeof result.missedSlots === "number")
      ? result.missedSlots : misses;
    if (this._ctx.phase === "challenge") {
      // Challenge: cumulative counter, 1 life per 2 missed slots
      this._challengeMissCounter += missedSlots;
      while (this._challengeMissCounter >= 2) {
        this._ctx.lives = Math.max(0, this._ctx.lives - 1);
        this._challengeMissCounter -= 2;
      }
    } else {
      // Learning: 1 life lost per pattern with 2+ missed slots
      if (missedSlots >= 2) {
        this._ctx.lives = Math.max(0, this._ctx.lives - 1);
      }
    }

    // --- Difficulty ramp (phase-specific) ---
    if (this._ctx.phase === "challenge") {
      // Challenge: advance every 4 patterns regardless of performance
      this._challengePatternCounter = (this._challengePatternCounter || 0) + 1;
      if (this._challengePatternCounter >= 4) {
        this._ctx.difficulty = Math.min(10, this._ctx.difficulty + 1);
        this._challengePatternCounter = 0;
      }
    } else {
      // Learning: 3 consecutive clean patterns → advance; 2+ misses → lower
      if (clean) {
        this._learningCleanCounter = (this._learningCleanCounter || 0) + 1;
        if (this._learningCleanCounter >= 3) {
          this._ctx.difficulty = Math.min(10, this._ctx.difficulty + 1);
          this._learningCleanCounter = 0;
        }
      } else if (totalMisses >= 2) {
        this._learningCleanCounter = 0;
        this._ctx.difficulty = Math.max(1, this._ctx.difficulty - 1);
      }
    }

    // Check game over
    if (this._ctx.lives <= 0) {
      this._transition(STATES.SUMMARY);
      return;
    }

    // Next transition based on mode
    if (this._ctx.phase === "challenge") {
      this._transition(STATES.RESPONSE);
    } else {
      this._transition(STATES.DEMO);
    }
  };

  FSM.prototype.goToSummary = function () {
    this._transition(STATES.SUMMARY);
  };

  // Summary → Setup (Play Again)
  FSM.prototype.playAgain = function () {
    if (this._state !== STATES.SUMMARY) return;
    this._transition(STATES.SETUP);
  };

  FSM.prototype._transition = function (newState) {
    var oldState = this._state;
    this._state = newState;
    this._ctx._notify();
    if (typeof this._onTransition === "function") {
      this._onTransition(oldState, newState, this._ctx.getSnapshot());
    }
  };

  FSM.prototype.reset = function () {
    this._state = STATES.SETUP;
    this._challengeMissCounter = 0;
    this._challengePatternCounter = 0;
    this._learningCleanCounter = 0;
    this._ctx.reset();
  };

  FSM.STATES = STATES;

  if (typeof window.feedBackMinigamesFSM === "undefined") {
    window.feedBackMinigamesFSM = {};
  }
  window.feedBackMinigamesFSM.FSM = FSM;
})();