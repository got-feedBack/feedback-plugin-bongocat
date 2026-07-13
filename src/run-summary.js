// Bongo Cat's Rhythm Trainer — Run Summary (task 4.1)
// Displays final results in the Summary state: score, grade, patterns survived,
// accuracy %, and best streak. Offers Play Again and Exit buttons.
// Reads from StateContext snapshot and optional computed stats.

(function () {
  "use strict";

  // ---------------------------------------------------------------------------
  // Grade thresholds (descending — first match wins)
  // ---------------------------------------------------------------------------

  var GRADE_THRESHOLDS = [
    { min: 95, grade: "S", label: "Superior" },
    { min: 85, grade: "A", label: "Excellent" },
    { min: 70, grade: "B", label: "Good" },
    { min: 50, grade: "C", label: "Average" },
    { min: 0,  grade: "D", label: "Needs Work" },
  ];

  // ---------------------------------------------------------------------------
  // RunSummary
  // ---------------------------------------------------------------------------

  function RunSummary(container, opts) {
    opts = opts || {};
    if (!container) throw new Error("RunSummary requires a container element");

    this._container = container;
    this._stateContext = opts.stateContext || null;
    this._onPlayAgain = opts.onPlayAgain || null;
    this._onExit = opts.onExit || null;

    // Computed stats passed from the game runner
    this._patternsSurvived = typeof opts.patternsSurvived === "number"
      ? Math.max(0, opts.patternsSurvived) : 0;
    this._accuracy = typeof opts.accuracy === "number" && !isNaN(opts.accuracy)
      ? Math.max(0, Math.min(100, opts.accuracy)) : 0;

    // Read snapshot from StateContext
    var snapshot = this._stateContext ? this._stateContext.getSnapshot() : {};
    this._score = typeof snapshot.score === "number" ? snapshot.score : 0;
    this._streak = typeof snapshot.streak === "number" ? snapshot.streak : 0;
    this._phase = typeof snapshot.phase === "string" ? snapshot.phase : "learning";
    this._difficulty = typeof snapshot.difficulty === "number" ? snapshot.difficulty : 1;

    this._el = null;
  }

  // ---------------------------------------------------------------------------
  // Grade calculation
  // ---------------------------------------------------------------------------

  /**
   * Resolve the letter grade from the stored accuracy percentage.
   * Thresholds (descending): S >= 95, A >= 85, B >= 70, C >= 50, D < 50.
   * @returns {{ grade: string, label: string }}
   */
  RunSummary.prototype._calculateGrade = function () {
    for (var i = 0; i < GRADE_THRESHOLDS.length; i++) {
      if (this._accuracy >= GRADE_THRESHOLDS[i].min) {
        return {
          grade: GRADE_THRESHOLDS[i].grade,
          label: GRADE_THRESHOLDS[i].label,
        };
      }
    }
    return { grade: "D", label: "Needs Work" };
  };

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  /**
   * Build the summary DOM and append it to the container.
   * Idempotent — safe to call multiple times (re-renders on second call).
   */
  RunSummary.prototype.render = function () {
    // Destroy previous render if any
    this.destroy();

    var el = document.createElement("div");
    el.className = "bc-game-root__run-summary";

    // --- Title ---
    var title = document.createElement("h2");
    title.className = "bc-game-root__summary-title";
    title.textContent = "Run Complete";
    el.appendChild(title);

    // --- Score ---
    var scoreRow = this._createStatRow("Score", this._formatScore(this._score));
    el.appendChild(scoreRow);

    // --- Grade (with colour-coded modifier) ---
    var gradeInfo = this._calculateGrade();
    var gradeRow = this._createStatRow(
      "Grade",
      gradeInfo.grade + " — " + gradeInfo.label
    );
    gradeRow.classList.add(
      "bc-game-root__summary-grade--" + gradeInfo.grade.toLowerCase()
    );
    el.appendChild(gradeRow);

    // --- Patterns Survived ---
    var patternsRow = this._createStatRow(
      "Patterns Survived",
      String(this._patternsSurvived)
    );
    el.appendChild(patternsRow);

    // --- Accuracy ---
    var accuracyRow = this._createStatRow(
      "Accuracy",
      Math.round(this._accuracy) + "%"
    );
    el.appendChild(accuracyRow);

    // --- Best Streak ---
    var streakRow = this._createStatRow("Best Streak", String(this._streak));
    el.appendChild(streakRow);

    // --- Mode ---
    var modeLabel = this._phase.charAt(0).toUpperCase() + this._phase.slice(1);
    var phaseRow = this._createStatRow("Mode", modeLabel);
    el.appendChild(phaseRow);

    // --- Button group ---
    var btnGroup = document.createElement("div");
    btnGroup.className = "bc-game-root__summary-btns";

    var self = this;

    var playAgainBtn = document.createElement("button");
    playAgainBtn.className =
      "bc-game-root__summary-btn bc-game-root__summary-btn--primary";
    playAgainBtn.textContent = "Play Again";
    playAgainBtn.addEventListener("click", function () {
      if (typeof self._onPlayAgain === "function") {
        self._onPlayAgain();
      }
    });
    btnGroup.appendChild(playAgainBtn);

    var exitBtn = document.createElement("button");
    exitBtn.className =
      "bc-game-root__summary-btn bc-game-root__summary-btn--secondary";
    exitBtn.textContent = "Exit";
    exitBtn.addEventListener("click", function () {
      if (typeof self._onExit === "function") {
        self._onExit();
      }
    });
    btnGroup.appendChild(exitBtn);

    el.appendChild(btnGroup);

    // --- Accessibility: aria-live region for screen readers ---
    var live = document.createElement("div");
    live.className = "bc-game-root__aria-live";
    live.setAttribute("aria-live", "polite");
    live.setAttribute("aria-atomic", "true");
    live.textContent =
      "Run complete. Score: " +
      this._formatScore(this._score) +
      ". Grade: " +
      gradeInfo.grade +
      ". Accuracy: " +
      Math.round(this._accuracy) +
      "%. Patterns survived: " +
      this._patternsSurvived +
      ".";
    el.appendChild(live);

    this._el = el;
    this._container.appendChild(el);
  };

  // ---------------------------------------------------------------------------
  // Internal: stat row factory
  // ---------------------------------------------------------------------------

  /**
   * Create a single stat row with label and value.
   * @param {string} label - Display label text
   * @param {string} value - Display value text
   * @returns {HTMLElement} The stat row element
   */
  RunSummary.prototype._createStatRow = function (label, value) {
    var row = document.createElement("div");
    row.className = "bc-game-root__summary-stat";

    var labelEl = document.createElement("span");
    labelEl.className = "bc-game-root__summary-stat-label";
    labelEl.textContent = label;
    row.appendChild(labelEl);

    var valueEl = document.createElement("span");
    valueEl.className = "bc-game-root__summary-stat-value";
    valueEl.textContent = value;
    row.appendChild(valueEl);

    return row;
  };

  // ---------------------------------------------------------------------------
  // Internal: score formatting
  // ---------------------------------------------------------------------------

  /**
   * Format a numeric score for human-readable display.
   * @param {number} score
   * @returns {string}
   */
  RunSummary.prototype._formatScore = function (score) {
    if (typeof score !== "number" || isNaN(score)) return "0";
    return score.toLocaleString();
  };

  // ---------------------------------------------------------------------------
  // Destroy
  // ---------------------------------------------------------------------------

  /**
   * Remove the summary DOM and release references.
   */
  RunSummary.prototype.destroy = function () {
    if (this._el && this._el.parentNode) {
      this._el.parentNode.removeChild(this._el);
    }
    this._el = null;
  };

  // ---------------------------------------------------------------------------
  // Module export
  // ---------------------------------------------------------------------------

  if (typeof window.feedBackMinigamesRunSummary === "undefined") {
    window.feedBackMinigamesRunSummary = {};
  }
  window.feedBackMinigamesRunSummary.RunSummary = RunSummary;
})();