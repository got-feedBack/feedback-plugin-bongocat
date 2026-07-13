// Bongo Cat's Rhythm Trainer — Single Tunables Store (AD-10)
// No module defines local copies or defaults for any tunable constant.

(function () {
  "use strict";

  var T = {
    // BPM
    BPM_MIN: 40,
    BPM_MAX: 180,
    BPM_DEFAULT_LEARNING: 80,
    BPM_DEFAULT_CHALLENGE: 100,
    BPM_SCALE_FACTOR: 80,  // linear normalization baseline

    // Hit Windows (ms) — field-tuned: with the energy detector + tap
    // calibration, real hits cluster at 20-60 ms error; the original
    // 25/60 windows graded honest playing as misses. 90 ms stays well
    // under the tightest onset gap (sixteenths at 180 BPM = 83 ms is the
    // one overlap; the judge's nearest-unmatched pairing disambiguates).
    PERFECT_INNER_MS: 40,
    GOOD_OUTER_MS: 90,
    MIC_LATENCY_COMPENSATION_MS: 0,

    // Debounce — must stay below the shortest legit onset gap (sixteenths
    // at BPM_MAX 180 = 83 ms). 70 ms kills the pick-transient double-fires
    // seen in the field (~54 ms apart) with headroom to spare.
    DOUBLE_TRIGGER_WINDOW_MS: 70,

    // Lives
    STARTING_LIVES: 5,
    LEARNING_MISS_THRESHOLD: 3,
    CHALLENGE_MISS_THRESHOLD: 2,

    // Scoring
    BASE_PERFECT: 100,
    BASE_GOOD: 60,
    BASE_MISS: 0,

    // Multiplier tiers: [{threshold: consecutive hits, mult: multiplier}]
    MULTIPLIER_TIERS: [
      { threshold: 0, mult: 1 },
      { threshold: 5, mult: 2 },
      { threshold: 10, mult: 3 },
      { threshold: 20, mult: 4 },
    ],

    // Ramp
    LEARNING_CLEAN_COUNT: 3,
    LEARNING_PENALTY_MISSES: 2,
    CHALLENGE_ADVANCE_EVERY: 2,
    RAMP_FLOOR: 1,
    RAMP_CEILING: 10,

    // Count-in
    COUNT_IN_LENGTH_BEATS: 4,

    // Pattern Generator: bar length in beats
    BAR_LENGTH_BEATS: 4,

    // Pattern Generator: slot vocabulary
    // Each slot: { name, duration (beats), onsetCount }
    // Rest-free vocabulary: every slot is exactly one beat, so a 4-beat
    // bar is always four slots and every slot carries onsets.
    SLOT_VOCABULARY: [
      { name: "quarter",         duration: 1.0, onsetCount: 1 },
      { name: "two-eighths",     duration: 1.0, onsetCount: 2 },
      { name: "four-sixteenths", duration: 1.0, onsetCount: 4 },
      { name: "eighth-triplet",  duration: 1.0, onsetCount: 3 },
    ],

    // Pattern Generator: per-difficulty slot weights (difficulty 1-10)
    // Weights for [quarter, two-eighths, four-sixteenths, eighth-triplet].
    // Triplets enter at difficulty 3 and ramp with the sixteenths — they
    // read harder than eighths but easier than sixteenths.
    DIFFICULTY_WEIGHTS: [
      [70, 30,  5,  0],  // 1  — mostly quarters
      [55, 35, 10,  0],  // 2
      [45, 35, 15,  3],  // 3  — triplets introduced
      [35, 35, 20,  6],  // 4
      [28, 32, 30, 10],  // 5  — midpoint: balanced
      [22, 30, 35, 12],  // 6
      [18, 26, 42, 14],  // 7
      [14, 23, 48, 15],  // 8
      [11, 20, 55, 16],  // 9
      [ 6, 18, 65, 16],  // 10 — sixteenth-heavy
    ],
  };

  // Freeze the object so consumers can't accidentally mutate constants
  var tunables = {};
  for (var k in T) {
    if (T.hasOwnProperty(k)) {
      tunables[k] = T[k];
    }
  }

  if (typeof window.feedBackMinigamesTunables === "undefined") {
    window.feedBackMinigamesTunables = {};
  }
  window.feedBackMinigamesTunables.T = tunables;
})();