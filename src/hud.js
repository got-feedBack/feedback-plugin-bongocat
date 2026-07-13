// Bongo Cat's Rhythm Trainer — HUD (AD-13, NFR-22)
// Heads-up display showing score, lives, streak, grade badges, phase, and BPM.
// Reads from StateContext via subscribe and offers showGrade() for flash feedback.

(function () {
  "use strict";

  var T =
    window.feedBackMinigamesTunables &&
    window.feedBackMinigamesTunables.T;

  var STARTING_LIVES = (T && T.STARTING_LIVES) || 3;

  // Grade badge display duration (ms) before fade-out
  var GRADE_FLASH_MS = (T && T.HUD_GRADE_FLASH_MS) || 1200;

  // Score animation duration (ms) for counting up
  var SCORE_ANIM_MS = (T && T.HUD_SCORE_ANIM_MS) || 400;

  // ---------------------------------------------------------------------------
  // Grade badge config
  // ---------------------------------------------------------------------------

  var GRADE_CONFIG = {
    perfect: {
      label: "Perfect!",
      cssClass: "bc-game-root__hud-grade--perfect",
      ariaLabel: "Perfect",
    },
    good: {
      label: "Good",
      cssClass: "bc-game-root__hud-grade--good",
      ariaLabel: "Good",
    },
    miss: {
      label: "Miss!",
      cssClass: "bc-game-root__hud-grade--miss",
      ariaLabel: "Miss",
    },
    "miss-extra": {
      label: "Miss!",
      cssClass: "bc-game-root__hud-grade--miss",
      ariaLabel: "Extra onset",
    },
  };

  // ---------------------------------------------------------------------------
  // HUD
  // ---------------------------------------------------------------------------

  function HUD(container, opts) {
    opts = opts || {};
    if (!container) throw new Error("HUD requires a container element");

    this._container = container;
    this._stateContext = opts.stateContext || null;
    this._bpm = opts.bpm || (T ? T.BPM_DEFAULT_LEARNING : 80);
    this._onGradeFlash = opts.onGradeFlash || null;

    // Read initial state from context if available
    var initialSnapshot = this._stateContext ? this._stateContext.getSnapshot() : null;

    // Current state values
    this._score = (initialSnapshot && typeof initialSnapshot.score === "number") ? initialSnapshot.score : 0;
    this._displayedScore = this._score; // for animation, start at actual score
    this._lives = (initialSnapshot && typeof initialSnapshot.lives === "number") ? initialSnapshot.lives : STARTING_LIVES;
    this._streak = (initialSnapshot && typeof initialSnapshot.streak === "number") ? initialSnapshot.streak : 0;
    this._phase = (initialSnapshot && typeof initialSnapshot.phase === "string") ? initialSnapshot.phase : "learning";

    // DOM references
    this._el = null;
    this._scoreEl = null;
    this._livesEl = null;
    this._streakEl = null;
    this._gradeEl = null;
    this._phaseEl = null;
    this._bpmEl = null;

    // Subscription & animation handles
    this._unsubscribe = null;
    this._animFrame = null;
    this._gradeTimeout = null;
    this._scoreAnimStart = null;
    this._scoreAnimFrom = 0;
    this._scoreAnimTo = 0;
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /**
   * Render the HUD DOM inside the container.
   * Idempotent — safe to call multiple times.
   */
  HUD.prototype.render = function () {
    if (this._el) return; // Already rendered

    this._el = document.createElement("div");
    this._el.className = "bc-game-root__hud";

    // --- Score ---
    var scoreWrap = document.createElement("div");
    scoreWrap.className = "bc-game-root__hud-score-wrap";
    this._el.appendChild(scoreWrap);

    var scoreLabel = document.createElement("span");
    scoreLabel.className = "bc-game-root__hud-label";
    scoreLabel.textContent = "Score";
    scoreWrap.appendChild(scoreLabel);

    this._scoreEl = document.createElement("span");
    this._scoreEl.className = "bc-game-root__hud-score";
    this._scoreEl.textContent = "0";
    scoreWrap.appendChild(this._scoreEl);

    // --- Lives ---
    var livesWrap = document.createElement("div");
    livesWrap.className = "bc-game-root__hud-lives-wrap";
    this._el.appendChild(livesWrap);

    this._livesEl = document.createElement("span");
    this._livesEl.className = "bc-game-root__hud-lives";
    this._livesEl.setAttribute("aria-label", "Lives: " + this._lives);
    this._renderHearts();
    livesWrap.appendChild(this._livesEl);

    // --- Streak ---
    var streakWrap = document.createElement("div");
    streakWrap.className = "bc-game-root__hud-streak-wrap";
    this._el.appendChild(streakWrap);

    var streakLabel = document.createElement("span");
    streakLabel.className = "bc-game-root__hud-label";
    streakLabel.textContent = "Streak";
    streakWrap.appendChild(streakLabel);

    this._streakEl = document.createElement("span");
    this._streakEl.className = "bc-game-root__hud-streak";
    this._streakEl.textContent = "0";
    streakWrap.appendChild(this._streakEl);

    // --- Grade badge (hidden by default) ---
    this._gradeEl = document.createElement("div");
    this._gradeEl.className = "bc-game-root__hud-grade";
    this._gradeEl.setAttribute("aria-live", "polite");
    this._gradeEl.style.display = "none";
    this._el.appendChild(this._gradeEl);

    // --- Phase indicator ---
    var phaseWrap = document.createElement("div");
    phaseWrap.className = "bc-game-root__hud-phase-wrap";
    this._el.appendChild(phaseWrap);

    this._phaseEl = document.createElement("span");
    this._phaseEl.className = "bc-game-root__hud-phase";
    this._phaseEl.textContent = this._phase.charAt(0).toUpperCase() + this._phase.slice(1);
    phaseWrap.appendChild(this._phaseEl);

    // --- BPM ---
    var bpmWrap = document.createElement("div");
    bpmWrap.className = "bc-game-root__hud-bpm-wrap";
    this._el.appendChild(bpmWrap);

    this._bpmEl = document.createElement("span");
    this._bpmEl.className = "bc-game-root__hud-bpm";
    this._bpmEl.textContent = this._bpm + " BPM";
    bpmWrap.appendChild(this._bpmEl);

    // Append to container
    this._container.appendChild(this._el);

    // Subscribe to StateContext if available
    this._subscribeToState();
  };

  /**
   * Set the current BPM value in the display.
   * @param {number} bpm
   */
  HUD.prototype.setBpm = function (bpm) {
    this._bpm = bpm;
    if (this._bpmEl) {
      this._bpmEl.textContent = bpm + " BPM";
    }
  };

  /**
   * Flash a grade badge on screen.
   * Accepts a grade string ("perfect", "good", "miss", "miss-extra")
   * or a patternResult object with a dominant grade determined from its grades.
   * @param {string|Object} grade
   */
  HUD.prototype.showGrade = function (grade) {
    if (!this._gradeEl) return;

    // Resolve grade string
    var gradeStr = typeof grade === "string" ? grade : this._dominantGrade(grade);
    if (!gradeStr || !GRADE_CONFIG[gradeStr]) return;

    var config = GRADE_CONFIG[gradeStr];

    // Clear any existing flash timeout
    if (this._gradeTimeout) {
      clearTimeout(this._gradeTimeout);
      this._gradeTimeout = null;
    }

    // Reset classes and show
    this._gradeEl.className = "bc-game-root__hud-grade";
    this._gradeEl.classList.add(config.cssClass);
    this._gradeEl.textContent = config.label;
    this._gradeEl.style.display = "block";
    this._gradeEl.setAttribute("aria-label", config.ariaLabel);

    // Fire callback
    if (typeof this._onGradeFlash === "function") {
      this._onGradeFlash(gradeStr);
    }

    // Auto-hide after duration
    var self = this;
    this._gradeTimeout = setTimeout(function () {
      self._gradeEl.style.display = "none";
      self._gradeTimeout = null;
    }, GRADE_FLASH_MS);
  };

  /**
   * Destroy the HUD: remove DOM, cancel timers and animation, unsubscribe.
   */
  HUD.prototype.destroy = function () {
    this._cancelAnimation();
    if (this._gradeTimeout) {
      clearTimeout(this._gradeTimeout);
      this._gradeTimeout = null;
    }
    if (this._unsubscribe) {
      this._unsubscribe();
      this._unsubscribe = null;
    }
    if (this._el && this._el.parentNode) {
      this._el.parentNode.removeChild(this._el);
    }
    this._el = null;
    this._scoreEl = null;
    this._livesEl = null;
    this._streakEl = null;
    this._gradeEl = null;
    this._phaseEl = null;
    this._bpmEl = null;
    this._container = null;
    this._stateContext = null;
  };

  // ---------------------------------------------------------------------------
  // Internal: StateContext subscription
  // ---------------------------------------------------------------------------

  HUD.prototype._subscribeToState = function () {
    if (!this._stateContext) return;
    var self = this;

    this._unsubscribe = this._stateContext.subscribe(function (snapshot) {
      self._handleSnapshot(snapshot);
    });
  };

  HUD.prototype._handleSnapshot = function (snapshot) {
    if (!snapshot) return;

    // Score (animated)
    if (typeof snapshot.score === "number" && snapshot.score !== this._score) {
      var oldScore = this._score;
      this._score = snapshot.score;
      this._startScoreAnimation(oldScore, snapshot.score);
    }

    // Lives
    if (typeof snapshot.lives === "number" && snapshot.lives !== this._lives) {
      this._lives = snapshot.lives;
      this._renderHearts();
      if (this._livesEl) {
        this._livesEl.setAttribute("aria-label", "Lives: " + this._lives);
      }
    }

    // Streak
    if (typeof snapshot.streak === "number" && snapshot.streak !== this._streak) {
      this._streak = snapshot.streak;
      if (this._streakEl) {
        this._streakEl.textContent = String(this._streak);
      }
    }

    // Phase
    if (typeof snapshot.phase === "string" && snapshot.phase !== this._phase) {
      this._phase = snapshot.phase;
      if (this._phaseEl) {
        this._phaseEl.textContent =
          snapshot.phase.charAt(0).toUpperCase() + snapshot.phase.slice(1);
      }
    }
  };

  // ---------------------------------------------------------------------------
  // Internal: Hearts rendering
  // ---------------------------------------------------------------------------

  HUD.prototype._renderHearts = function () {
    if (!this._livesEl) return;
    this._livesEl.innerHTML = "";

    for (var i = 0; i < STARTING_LIVES; i++) {
      var heart = document.createElement("span");
      heart.className = "bc-game-root__hud-heart";
      if (i >= this._lives) {
        heart.classList.add("bc-game-root__hud-heart--empty");
        heart.textContent = "♡"; // ♡ empty heart
      } else {
        heart.textContent = "♥"; // ♥ filled heart
      }
      this._livesEl.appendChild(heart);
    }
  };

  // ---------------------------------------------------------------------------
  // Internal: Score animation
  // ---------------------------------------------------------------------------

  HUD.prototype._startScoreAnimation = function (from, to) {
    this._cancelAnimation();

    this._scoreAnimFrom = from;
    this._scoreAnimTo = to;
    this._scoreAnimStart = null;

    var self = this;
    this._animFrame = requestAnimationFrame(function (timestamp) {
      self._tickScore(timestamp);
    });
  };

  HUD.prototype._tickScore = function (timestamp) {
    if (!this._scoreEl) return;

    if (this._scoreAnimStart === null) {
      this._scoreAnimStart = timestamp;
    }

    var elapsed = timestamp - this._scoreAnimStart;
    var progress = Math.min(elapsed / SCORE_ANIM_MS, 1);

    // Ease-out cubic
    var eased = 1 - Math.pow(1 - progress, 3);
    var current = Math.round(
      this._scoreAnimFrom + (this._scoreAnimTo - this._scoreAnimFrom) * eased
    );

    this._displayedScore = current;
    this._scoreEl.textContent = this._formatScore(current);

    if (progress < 1) {
      var self = this;
      this._animFrame = requestAnimationFrame(function (ts) {
        self._tickScore(ts);
      });
    } else {
      this._animFrame = null;
    }
  };

  HUD.prototype._cancelAnimation = function () {
    if (this._animFrame !== null) {
      cancelAnimationFrame(this._animFrame);
      this._animFrame = null;
    }
  };

  // ---------------------------------------------------------------------------
  // Internal: Format helpers
  // ---------------------------------------------------------------------------

  HUD.prototype._formatScore = function (score) {
    if (typeof score !== "number" || isNaN(score)) return "0";
    return score.toLocaleString();
  };

  /**
   * Determine the dominant grade from a patternResult object.
   * Priority: miss > good > perfect.
   * @param {Object} result - patternResult with grades, misses, extras, etc.
   * @returns {string|null} grade string or null
   */
  HUD.prototype._dominantGrade = function (result) {
    if (!result || typeof result !== "object") return null;

    // If the patternResult has explicit counts, use them
    var misses = result.misses || 0;
    var extras = result.extras || 0;
    var goods = result.goods || 0;
    var perfects = result.perfects || 0;

    if (misses > 0 || extras > 0) return "miss";
    if (goods > 0) return "good";
    if (perfects > 0) return "perfect";

    // Fallback: scan grades array
    var grades = result.grades;
    if (Array.isArray(grades) && grades.length > 0) {
      for (var i = 0; i < grades.length; i++) {
        var g = grades[i].grade;
        if (g === "miss" || g === "miss-extra") return "miss";
      }
      for (var j = 0; j < grades.length; j++) {
        if (grades[j].grade === "good") return "good";
      }
      return "perfect";
    }

    return null;
  };

  // ---------------------------------------------------------------------------
  // Module export
  // ---------------------------------------------------------------------------

  if (typeof window.feedBackMinigamesHUD === "undefined") {
    window.feedBackMinigamesHUD = {};
  }
  window.feedBackMinigamesHUD.HUD = HUD;
})();