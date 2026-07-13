// Bongo Cat's Rhythm Trainer — Scoring Module (AD-10, NFR-18)
// Computes scored results with multiplier and BPM scaling.
// Stateless utility consumed by FSM.handlePatternResult.

(function () {
  "use strict";

  var T = window.feedBackMinigamesTunables && window.feedBackMinigamesTunables.T;

  // ---------------------------------------------------------------------------
  // Tunable fallbacks (centralized in tunables.js)
  // ---------------------------------------------------------------------------

  var BASE_PERFECT = (T && T.BASE_PERFECT) || 100;
  var BASE_GOOD = (T && T.BASE_GOOD) || 60;
  var BASE_MISS = (T && T.BASE_MISS) || 0;
  var BPM_SCALE_FACTOR = (T && T.BPM_SCALE_FACTOR) || 80;
  var MULTIPLIER_TIERS = (T && T.MULTIPLIER_TIERS) || [
    { threshold: 0, mult: 1 },
    { threshold: 5, mult: 2 },
    { threshold: 10, mult: 3 },
    { threshold: 20, mult: 4 },
  ];

  // ---------------------------------------------------------------------------
  // Scoring
  // ---------------------------------------------------------------------------

  function Scoring() {}

  /**
   * Calculate the total score for a single pattern result.
   *
   * Formula (per story 2.5):
   *   score = (perfects * BASE_PERFECT + goods * BASE_GOOD)
   *           * streakMultiplier
   *           * (bpm / BPM_SCALE_FACTOR)
   *
   * The multiplier is based on the streak BEFORE this pattern's result
   * is applied (i.e., the current streak before increment/reset).
   *
   * @param {number} perfects - Count of perfect onsets in the pattern
   * @param {number} goods    - Count of good onsets in the pattern
   * @param {number} streak   - Current streak before this pattern result
   * @param {number} bpm      - Current BPM of the run
   * @returns {number} Rounded integer score
   */
  Scoring.prototype.calculateScore = function (perfects, goods, streak, bpm) {
    var baseScore = perfects * BASE_PERFECT + goods * BASE_GOOD;
    var multiplier = this.calculateMultiplier(streak);
    var bpmFactor = bpm / BPM_SCALE_FACTOR;
    return Math.round(baseScore * multiplier * bpmFactor);
  };

  /**
   * Look up the multiplier for a given streak count.
   *
   * Returns the highest tier whose threshold the streak meets or exceeds.
   * Streak 0 always returns x1 (the first tier).
   *
   * @param {number} streak - Current streak count
   * @returns {number} Multiplier value (1, 2, 3, or 4)
   */
  Scoring.prototype.calculateMultiplier = function (streak) {
    var mult = 1;
    for (var i = 0; i < MULTIPLIER_TIERS.length; i++) {
      if (streak >= MULTIPLIER_TIERS[i].threshold) {
        mult = MULTIPLIER_TIERS[i].mult;
      }
    }
    return mult;
  };

  /**
   * Format a score value for human-readable display.
   * Uses locale formatting for digit grouping.
   *
   * @param {number} score - Raw numeric score
   * @returns {string} Formatted score string (e.g., "1,234")
   */
  Scoring.prototype.formatScore = function (score) {
    if (typeof score !== "number" || isNaN(score)) return "0";
    return score.toLocaleString();
  };

  // ---------------------------------------------------------------------------
  // Module export
  // ---------------------------------------------------------------------------

  if (typeof window.feedBackMinigamesScoring === "undefined") {
    window.feedBackMinigamesScoring = {};
  }
  window.feedBackMinigamesScoring.Scoring = Scoring;
})();