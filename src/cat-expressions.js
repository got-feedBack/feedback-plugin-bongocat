// Bongo Cat's Rhythm Trainer — Cat Expressions (AD-3, AD-5, AD-9, NFR-2)
// Shows cat face expressions that react to Judge grade events.
// States: idle, focusing, happy (perfect), good, sad (miss).
// Uses emoji text representations displayed in a DOM element.
// CSS classes under .bc-game-root.

(function () {
  "use strict";

  var T =
    window.feedBackMinigamesTunables &&
    window.feedBackMinigamesTunables.T;

  // ---------------------------------------------------------------------------
  // Expression state enum
  // ---------------------------------------------------------------------------

  var EXPRESSION = {
    IDLE: "idle",
    FOCUSING: "focusing",
    HAPPY: "happy",
    GOOD: "good",
    SAD: "sad",
  };

  // ---------------------------------------------------------------------------
  // Emoji/text face representations per state
  // ---------------------------------------------------------------------------

  var EXPRESSION_FACE = {
    idle: "( o.o )",
    focusing: "( >.< )",
    happy: "( ^.^ )",
    good: "( ~.~ )",
    sad: "( ;.; )",
  };

  // Accessible labels for screen readers
  var EXPRESSION_LABEL = {
    idle: "Bongo Cat is resting",
    focusing: "Bongo Cat is focusing",
    happy: "Perfect! Bongo Cat is happy",
    good: "Good hit! Bongo Cat is pleased",
    sad: "Miss! Bongo Cat is sad",
  };

  // Auto-revert delay after a grade-triggered expression (ms)
  var AUTO_REVERT_MS = (T && T.CAT_EXPRESSION_AUTO_REVERT_MS) || 600;

  // ---------------------------------------------------------------------------
  // CatExpressions
  // ---------------------------------------------------------------------------

  function CatExpressions(container, opts) {
    opts = opts || {};
    if (!container) throw new Error("CatExpressions requires a container element");

    this._container = container;
    this._judge = opts.judge || null;
    this._onExpressionChange = opts.onExpressionChange || null;
    this._autoRevertMs =
      opts.autoRevertMs != null ? opts.autoRevertMs : AUTO_REVERT_MS;

    this._expression = EXPRESSION.IDLE;
    this._el = null;
    this._faceEl = null;
    this._labelEl = null;
    this._revertTimer = null;

    // If given a judge, hook into its onResult callback
    if (this._judge) {
      this._hookJudge();
    }
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  CatExpressions.prototype.render = function () {
    if (this._el) return;
    this._buildDOM();
    this._container.appendChild(this._el);
    this._updateDisplay();
  };

  /**
   * Set the expression directly.
   * @param {string} expr - One of EXPRESSION values
   */
  CatExpressions.prototype.setExpression = function (expr) {
    if (this._expression === expr) return;
    if (!EXPRESSION_FACE.hasOwnProperty(expr)) return;

    var oldExpr = this._expression;
    this._expression = expr;
    this._updateDisplay();

    if (typeof this._onExpressionChange === "function") {
      this._onExpressionChange(oldExpr, expr);
    }
  };

  /**
   * Get the current expression name.
   * @returns {string}
   */
  CatExpressions.prototype.getExpression = function () {
    return this._expression;
  };

  /**
   * Handle a single grade event from the Judge.
   * Maps "perfect" -> happy, "good" -> good, "miss" or "miss-extra" -> sad.
   * After a configurable delay, auto-reverts to focusing.
   * @param {string} grade - "perfect", "good", "miss", or "miss-extra"
   */
  CatExpressions.prototype.handleGrade = function (grade) {
    var expr;

    switch (grade) {
      case "perfect":
        expr = EXPRESSION.HAPPY;
        break;
      case "good":
        expr = EXPRESSION.GOOD;
        break;
      case "miss":
      case "miss-extra":
        expr = EXPRESSION.SAD;
        break;
      default:
        return;
    }

    this.setExpression(expr);
    this._scheduleRevert();
  };

  /**
   * Handle a full patternResult from Judge.gradePattern.
   * Examines the grades array and picks the most negative grade encountered
   * (sad > good > happy) for the expression, then reverts to focusing.
   * @param {Object} patternResult - Result from Judge.gradePattern
   */
  CatExpressions.prototype.handlePatternResult = function (patternResult) {
    if (!patternResult || !patternResult.grades || patternResult.grades.length === 0) {
      return;
    }

    // Determine the most negative grade to show the most expressive reaction
    var hasMiss = false;
    var hasGood = false;
    var hasPerfect = false;

    for (var i = 0; i < patternResult.grades.length; i++) {
      var g = patternResult.grades[i].grade;
      if (g === "miss" || g === "miss-extra") {
        hasMiss = true;
      } else if (g === "good") {
        hasGood = true;
      } else if (g === "perfect") {
        hasPerfect = true;
      }
    }

    // Priority: miss > good > perfect (show the worst reaction)
    if (hasMiss) {
      this.setExpression(EXPRESSION.SAD);
    } else if (hasGood) {
      this.setExpression(EXPRESSION.GOOD);
    } else if (hasPerfect) {
      this.setExpression(EXPRESSION.HAPPY);
    }

    this._scheduleRevert();
  };

  /**
   * Reset to idle expression.
   */
  CatExpressions.prototype.reset = function () {
    this._cancelRevert();
    this.setExpression(EXPRESSION.IDLE);
  };

  /**
   * Set to focusing expression (called when gameplay starts).
   */
  CatExpressions.prototype.focus = function () {
    this._cancelRevert();
    this.setExpression(EXPRESSION.FOCUSING);
  };

  /**
   * Clean up DOM and timers.
   */
  CatExpressions.prototype.destroy = function () {
    this._cancelRevert();
    this._unhookJudge();

    if (this._el && this._el.parentNode) {
      this._el.parentNode.removeChild(this._el);
    }

    this._container = null;
    this._judge = null;
    this._el = null;
    this._faceEl = null;
    this._labelEl = null;
    this._onExpressionChange = null;
  };

  // ---------------------------------------------------------------------------
  // Judge integration
  // ---------------------------------------------------------------------------

  CatExpressions.prototype._hookJudge = function () {
    if (!this._judge) return;

    var self = this;

    // Wrap the existing onResult callback so we don't overwrite it
    var existingOnResult = null;
    if (typeof this._judge._onResult === "function") {
      existingOnResult = this._judge._onResult;
    }

    this._judge._onResult = function (result) {
      self.handlePatternResult(result);
      if (typeof existingOnResult === "function") {
        existingOnResult(result);
      }
    };
  };

  CatExpressions.prototype._unhookJudge = function () {
    // We don't try to restore the original callback here since
    // the judge may have been re-wired between hook and destroy.
    // In practice, CatExpressions is destroyed when the game leaves,
    // so the judge is no longer active.
  };

  // ---------------------------------------------------------------------------
  // Auto-revert timer
  // ---------------------------------------------------------------------------

  CatExpressions.prototype._scheduleRevert = function () {
    this._cancelRevert();
    var self = this;
    this._revertTimer = setTimeout(function () {
      self._revertTimer = null;
      self.setExpression(EXPRESSION.FOCUSING);
    }, this._autoRevertMs);
  };

  CatExpressions.prototype._cancelRevert = function () {
    if (this._revertTimer !== null) {
      clearTimeout(this._revertTimer);
      this._revertTimer = null;
    }
  };

  // ---------------------------------------------------------------------------
  // DOM construction
  // ---------------------------------------------------------------------------

  CatExpressions.prototype._buildDOM = function () {
    var el = document.createElement("div");
    el.className = "bc-game-root__cat-expressions";

    // Face display (emoji/text expression)
    var face = document.createElement("div");
    face.className = "bc-game-root__cat-expressions-face";
    face.textContent = EXPRESSION_FACE.idle;
    el.appendChild(face);
    this._faceEl = face;

    // Hidden aria-live label for screen readers
    var label = document.createElement("div");
    label.className = "bc-game-root__cat-expressions-label";
    label.setAttribute("aria-live", "polite");
    label.textContent = EXPRESSION_LABEL.idle;
    el.appendChild(label);
    this._labelEl = label;

    this._el = el;
  };

  // ---------------------------------------------------------------------------
  // Display update
  // ---------------------------------------------------------------------------

  CatExpressions.prototype._updateDisplay = function () {
    if (!this._el) return;

    var expr = this._expression;

    // Update face text
    if (this._faceEl) {
      this._faceEl.textContent = EXPRESSION_FACE[expr] || EXPRESSION_FACE.idle;
    }

    // Update aria label
    if (this._labelEl) {
      this._labelEl.textContent = EXPRESSION_LABEL[expr] || EXPRESSION_LABEL.idle;
    }

    // Update CSS state class on root element
    // Remove all state classes, then add the current one
    for (var key in EXPRESSION) {
      if (EXPRESSION.hasOwnProperty(key)) {
        this._el.classList.remove(
          "bc-game-root__cat-expressions--" + EXPRESSION[key]
        );
      }
    }
    this._el.classList.add("bc-game-root__cat-expressions--" + expr);
  };

  // ---------------------------------------------------------------------------
  // Module export
  // ---------------------------------------------------------------------------

  CatExpressions.EXPRESSION = EXPRESSION;

  if (typeof window.feedBackMinigamesCatExpressions === "undefined") {
    window.feedBackMinigamesCatExpressions = {};
  }
  window.feedBackMinigamesCatExpressions.CatExpressions = CatExpressions;
})();