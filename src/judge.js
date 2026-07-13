// Bongo Cat's Rhythm Trainer — Judge (AD-3, AD-5, AD-9, NFR-2)
// Consumes Onset stream, compares to expected onsets from Pattern, and emits
// patternResult. Pure emitter — does not mutate FSM state.

(function () {
  "use strict";

  var T = window.feedBackMinigamesTunables && window.feedBackMinigamesTunables.T;

  // ---------------------------------------------------------------------------
  // Hit window constants (from centralized tunables)
  // ---------------------------------------------------------------------------

  var PERFECT_INNER_MS = (T && T.PERFECT_INNER_MS) || 25;
  var GOOD_OUTER_MS = (T && T.GOOD_OUTER_MS) || 60;

  // ---------------------------------------------------------------------------
  // Judge
  // ---------------------------------------------------------------------------

  function Judge(opts) {
    opts = opts || {};
    this._onResult = opts.onResult || null;
    this._perfectInnerMs = opts.perfectInnerMs || PERFECT_INNER_MS;
    this._goodOuterMs = opts.goodOuterMs || GOOD_OUTER_MS;
    this._bpm = opts.bpm || 80;
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  Judge.prototype.setBpm = function (bpm) {
    this._bpm = bpm;
  };

  Judge.prototype.setPerfectInnerMs = function (ms) {
    this._perfectInnerMs = ms;
  };

  Judge.prototype.setGoodOuterMs = function (ms) {
    this._goodOuterMs = ms;
  };

  Judge.prototype.setOnResult = function (fn) {
    this._onResult = fn;
  };

  // ---------------------------------------------------------------------------
  // Core grading logic
  // ---------------------------------------------------------------------------

  /**
   * Grade player onsets against a Pattern's expected onsets.
   *
   * @param {Array<Onset>} onsets    - Player onset records from InputAdapter
   * @param {Object}        pattern  - Pattern with expectedOnsets (beat times)
   * @param {number}        [barEndBeat] - Optional bar boundary beat (if omitted,
   *                                       computed from pattern expectedOnsets)
   * @returns {Object} patternResult - { score, perfects, goods, misses, extras,
   *                                    clean, totalOnsets, grades, emitTime }
   */
  Judge.prototype.gradePattern = function (onsets, pattern, barEndBeat) {
    if (!pattern || !pattern.expectedOnsets) {
      return _emptyResult(0, 0);
    }

    onsets = onsets || [];
    var expected = pattern.expectedOnsets;
    var bpm = this._bpm;

    // Convert hit windows from ms to beats at current BPM
    var msPerBeat = 60000 / bpm;
    var perfectInnerBeats = this._perfectInnerMs / msPerBeat;
    var goodOuterBeats = this._goodOuterMs / msPerBeat;

    // Track which expected onsets have been matched
    var matched = new Array(expected.length);
    for (var mi = 0; mi < matched.length; mi++) {
      matched[mi] = false;
    }

    var grades = [];
    var perfects = 0;
    var goods = 0;
    var misses = 0;
    var extras = 0;

    // For each player onset, find the nearest unmatched expected onset
    for (var i = 0; i < onsets.length; i++) {
      var onset = onsets[i];
      var playerBeat = onset.beatTime;

      var bestIdx = -1;
      var bestDelta = Infinity;

      for (var j = 0; j < expected.length; j++) {
        if (matched[j]) continue;
        var delta = Math.abs(playerBeat - expected[j]);
        if (delta < bestDelta) {
          bestDelta = delta;
          bestIdx = j;
        }
      }

      // Check if within Good window
      if (bestIdx !== -1 && bestDelta <= goodOuterBeats) {
        matched[bestIdx] = true;

        if (bestDelta <= perfectInnerBeats) {
          grades.push({
            onsetBeatTime: expected[bestIdx],
            playerBeatTime: playerBeat,
            grade: "perfect",
          });
          perfects++;
        } else {
          grades.push({
            onsetBeatTime: expected[bestIdx],
            playerBeatTime: playerBeat,
            grade: "good",
          });
          goods++;
        }
      } else {
        // Extra onset — no matching pattern slot
        grades.push({
          onsetBeatTime: null,
          playerBeatTime: playerBeat,
          grade: "miss-extra",
        });
        extras++;
      }
    }

    // Count unmatched expected onsets as misses
    for (var k = 0; k < expected.length; k++) {
      if (!matched[k]) {
        grades.push({
          onsetBeatTime: expected[k],
          playerBeatTime: null,
          grade: "miss",
        });
        misses++;
      }
    }

    // Sort grades by onsetBeatTime (nulls last)
    grades.sort(function (a, b) {
      if (a.onsetBeatTime === null && b.onsetBeatTime === null) return 0;
      if (a.onsetBeatTime === null) return 1;
      if (b.onsetBeatTime === null) return -1;
      return a.onsetBeatTime - b.onsetBeatTime;
    });

    var totalOnsets = expected.length;
    var clean = misses === 0 && extras === 0;

    // Slots containing at least one missed onset. Life drain is per-SLOT:
    // whiffing all four sixteenths of one slot is ONE mistake, not four.
    var missedSlots = 0;
    if (pattern.slots && pattern.slots.length) {
      var missedBeats = [];
      for (var mg = 0; mg < grades.length; mg++) {
        if (grades[mg].grade === "miss" && grades[mg].onsetBeatTime !== null) {
          missedBeats.push(grades[mg].onsetBeatTime);
        }
      }
      var cursor = 0;
      for (var si = 0; si < pattern.slots.length; si++) {
        var slotEnd = cursor + pattern.slots[si].duration;
        for (var mb = 0; mb < missedBeats.length; mb++) {
          if (missedBeats[mb] >= cursor - 1e-6 && missedBeats[mb] < slotEnd - 1e-6) {
            missedSlots++;
            break;
          }
        }
        cursor = slotEnd;
      }
    } else {
      missedSlots = misses; // no slot info — degrade to per-miss
    }

    // Compute emit time = max(last hit-window end, pattern-end bar boundary)
    var emitTime = this._computeEmitTime(expected, barEndBeat, goodOuterBeats, bpm);

    // Compute score
    var score = this._computeScore(perfects, goods);

    var result = {
      score: score,
      perfects: perfects,
      goods: goods,
      misses: misses,
      extras: extras,
      missedSlots: missedSlots,
      clean: clean,
      totalOnsets: totalOnsets,
      grades: grades,
      emitTime: emitTime,
    };

    if (typeof this._onResult === "function") {
      this._onResult(result);
    }

    return result;
  };

  // ---------------------------------------------------------------------------
  // Internal helpers
  // ---------------------------------------------------------------------------

  /**
   * Score computation: perfect = 100, good = 60, miss = 0 (from tunables).
   * Extra onsets cost 0 but affect streak via clean flag.
   */
  Judge.prototype._computeScore = function (perfects, goods) {
    var basePerfect = (T && T.BASE_PERFECT) || 100;
    var baseGood = (T && T.BASE_GOOD) || 60;
    return perfects * basePerfect + goods * baseGood;
  };

  /**
   * Compute the emission time for patternResult:
   *   emitTime = max(
   *     lastHitWindowEnd,      // when the last hit window expires
   *     patternEndBarBoundary  // the bar boundary after the pattern ends
   *   )
   *
   * @returns {number} emitTime in beats (relative to pattern start)
   */
  Judge.prototype._computeEmitTime = function (expectedOnsets, barEndBeat, goodOuterBeats, bpm) {
    if (expectedOnsets.length === 0) {
      return barEndBeat || 0;
    }

    // Last expected onset beat + good window outer edge (in beats)
    var lastExpected = expectedOnsets[expectedOnsets.length - 1];
    var lastHitWindowEnd = lastExpected + goodOuterBeats;

    // Pattern end: barEndBeat, or the beat after the last onset if not provided
    var patternEnd = barEndBeat;
    if (typeof patternEnd !== "number") {
      // Default: one full bar after the last onset
      var msPerBeat = bpm > 0 ? 60000 / bpm : 750;
      patternEnd = Math.max(
        lastExpected + 4, // at least 4 beats from start
        4                 // but at least 1 full bar
      );
    }

    return Math.max(lastHitWindowEnd, patternEnd);
  };

  // ---------------------------------------------------------------------------
  // Internal: empty result factory
  // ---------------------------------------------------------------------------

  function _emptyResult(totalOnsets, emitTime) {
    return {
      score: 0,
      perfects: 0,
      goods: 0,
      misses: 0,
      extras: 0,
      clean: true,
      totalOnsets: totalOnsets,
      grades: [],
      emitTime: emitTime || 0,
    };
  }

  // ---------------------------------------------------------------------------
  // Module export
  // ---------------------------------------------------------------------------

  if (typeof window.feedBackMinigamesJudge === "undefined") {
    window.feedBackMinigamesJudge = {};
  }
  window.feedBackMinigamesJudge.Judge = Judge;

})();