(function () {
  "use strict";

  function StateContext(opts) {
    opts = opts || {};
    this.score = 0;
    // Remember the configured lives so reset() restores THEM, not a
    // hardcoded default (the controller passes T.STARTING_LIVES).
    this._startingLives = opts.startingLives || 3;
    this.lives = this._startingLives;
    this.streak = 0;
    this.difficulty = opts.startingDifficulty || 1;
    this.phase = opts.phase || "learning";
    this.currentPattern = null;
    this.nextPattern = null;
    this.listeners = [];
  }

  StateContext.prototype.getSnapshot = function () {
    return {
      score: this.score,
      lives: this.lives,
      streak: this.streak,
      difficulty: this.difficulty,
      phase: this.phase,
      currentPattern: this.currentPattern,
      nextPattern: this.nextPattern,
    };
  };

  StateContext.prototype.subscribe = function (fn) {
    this.listeners.push(fn);
    var self = this;
    return function () {
      var idx = self.listeners.indexOf(fn);
      if (idx !== -1) self.listeners.splice(idx, 1);
    };
  };

  StateContext.prototype._notify = function () {
    var snapshot = this.getSnapshot();
    for (var i = 0; i < this.listeners.length; i++) {
      try {
        this.listeners[i](snapshot);
      } catch (e) {}
    }
  };

  StateContext.prototype.reset = function (phase, startingLives) {
    this.score = 0;
    this.lives = startingLives || this._startingLives;
    this.streak = 0;
    this.difficulty = 1;
    this.phase = phase || "learning";
    this.currentPattern = null;
    this.nextPattern = null;
    this._notify();
  };

  if (typeof window.feedBackMinigamesFSM === "undefined") {
    window.feedBackMinigamesFSM = {};
  }
  window.feedBackMinigamesFSM.StateContext = StateContext;
})();