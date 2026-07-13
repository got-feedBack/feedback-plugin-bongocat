// Bongo Cat's Rhythm Trainer — Pattern Generator (AD-4, AD-8, NFR-15, NFR-16)
// Pure function: (difficultyLevel, seed) -> { currentPattern, nextPattern }
// Deterministic, zero side effects, no I/O, no DOM access.

(function () {
  "use strict";

  var T = window.feedBackMinigamesTunables.T;

  // ---------------------------------------------------------------------------
  // Seeded PRNG — mulberry32 (deterministic, pure function of seed)
  // ---------------------------------------------------------------------------
  function mulberry32(seed) {
    var s = seed | 0;
    return function () {
      s = (s + 0x6D2B79F5) | 0;
      var t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // ---------------------------------------------------------------------------
  // Weighted random pick from array of { item, weight }
  // ---------------------------------------------------------------------------
  function weightedPick(rand, candidates) {
    var total = 0;
    for (var i = 0; i < candidates.length; i++) {
      total += candidates[i].weight;
    }
    var r = rand() * total;
    var cumulative = 0;
    for (var i = 0; i < candidates.length; i++) {
      cumulative += candidates[i].weight;
      if (r < cumulative) {
        return candidates[i].item;
      }
    }
    return candidates[candidates.length - 1].item;
  }

  // ---------------------------------------------------------------------------
  // Slot generation for one bar
  // ---------------------------------------------------------------------------
  function getWeights(difficulty) {
    var clamped = Math.max(1, Math.min(10, Math.round(difficulty)));
    return T.DIFFICULTY_WEIGHTS[clamped - 1];
  }

  function generateSlots(rand, difficulty) {
    var weights = getWeights(difficulty);
    var vocabulary = T.SLOT_VOCABULARY;
    var barLength = T.BAR_LENGTH_BEATS;

    // Build weighted candidates from vocabulary using this difficulty's weights
    var weighted = vocabulary.map(function (slot, i) {
      return { item: slot, weight: weights[i] };
    });

    var slots = [];
    var remaining = barLength;

    while (remaining > 0.005) {
      // Filter to slots that fit in remaining space (fuzzy comparison)
      var fit = weighted.filter(function (w) {
        return w.item.duration <= remaining + 0.001;
      });

      if (fit.length === 0) {
        // Fallback: use the smallest available slot (eighth-rest, 0.5 beats)
        // This should never happen with 0.5-beat granularity at 4.0 beats,
        // but guards against floating-point edge cases.
        var smallest = null;
        for (var i = 0; i < vocabulary.length; i++) {
          if (!smallest || vocabulary[i].duration < smallest.duration) {
            smallest = vocabulary[i];
          }
        }
        slots.push({
          type: smallest.onsetCount > 0 ? "onset" : "rest",
          duration: smallest.duration,
          onsetCount: smallest.onsetCount,
        });
        remaining -= smallest.duration;
        continue;
      }

      var picked = weightedPick(rand, fit);
      slots.push({
        type: picked.onsetCount > 0 ? "onset" : "rest",
        duration: picked.duration,
        onsetCount: picked.onsetCount,
      });
      remaining -= picked.duration;
    }

    return slots;
  }

  // ---------------------------------------------------------------------------
  // Validation: at least one onset, not all rests
  // ---------------------------------------------------------------------------
  function validatePattern(slots) {
    var hasOnset = false;
    var allRests = true;
    for (var i = 0; i < slots.length; i++) {
      if (slots[i].type === "onset") {
        hasOnset = true;
        allRests = false;
        break; // early exit — we already know it's not all rests
      }
    }
    return hasOnset && !allRests;
  }

  // ---------------------------------------------------------------------------
  // Compute expected onset beat times from slots
  // ---------------------------------------------------------------------------
  function computeExpectedOnsets(slots) {
    var onsets = [];
    var beatCursor = 0;
    for (var i = 0; i < slots.length; i++) {
      var slot = slots[i];
      if (slot.type === "onset") {
        var spacing = slot.duration / slot.onsetCount;
        for (var j = 0; j < slot.onsetCount; j++) {
          onsets.push(beatCursor + j * spacing);
        }
      }
      beatCursor += slot.duration;
    }
    return onsets;
  }

  // ---------------------------------------------------------------------------
  // Freeze a pattern deeply (recursive Object.freeze for slots array)
  // ---------------------------------------------------------------------------
  function freezePattern(pattern) {
    for (var i = 0; i < pattern.slots.length; i++) {
      Object.freeze(pattern.slots[i]);
    }
    Object.freeze(pattern.slots);
    Object.freeze(pattern.expectedOnsets);
    return Object.freeze(pattern);
  }

  // ---------------------------------------------------------------------------
  // Core generation function
  // ---------------------------------------------------------------------------
  function generateSingle(rand, difficulty) {
    var slots;
    var valid = false;
    var maxAttempts = 20;
    var attempt = 0;

    // Retry until constraints are met (or we give up)
    while (!valid && attempt < maxAttempts) {
      slots = generateSlots(rand, difficulty);
      valid = validatePattern(slots);
      attempt++;
    }

    // Safety net: if we exhausted retries, force at least one onset
    if (!valid) {
      for (var i = 0; i < slots.length; i++) {
        if (slots[i].type === "rest") {
          slots[i] = {
            type: "onset",
            duration: slots[i].duration,
            onsetCount: 1,
          };
          break;
        }
      }
    }

    var expectedOnsets = computeExpectedOnsets(slots);

    return freezePattern({
      difficulty: difficulty,
      seed: 0, // caller fills this in
      barCount: 1,
      slots: slots,
      expectedOnsets: expectedOnsets,
    });
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /**
   * Generate patterns from a difficulty level and seed.
   *
   * @param {number} difficulty - Difficulty level (1-10, clamped)
   * @param {number} seed       - Integer seed for deterministic output
   * @returns {{ currentPattern: Pattern, nextPattern: Pattern }}
   *
   * Pattern shape:
   *   { difficulty, seed, barCount, slots: Slot[], expectedOnsets: number[] }
   *
   * Slot shape:
   *   { type: 'onset'|'rest', duration: number (beats), onsetCount: number }
   *
   * All returned objects are frozen (immutable).
   */
  function generate(difficulty, seed) {
    if (typeof seed !== "number" || isNaN(seed)) {
      seed = 0;
    }
    // Ensure seed is an integer
    seed = Math.floor(seed);

    var rand = mulberry32(seed);
    var currentPattern = generateSingle(rand, difficulty);
    // Patch the seed onto the frozen pattern (safe because we own the reference)
    currentPattern = freezePattern(
      Object.assign({}, currentPattern, { seed: seed })
    );

    // Generate nextPattern with seed offset + 1 (for Challenge mode lookahead)
    var nextRand = mulberry32(seed + 1);
    var nextPattern = generateSingle(nextRand, difficulty);
    nextPattern = freezePattern(
      Object.assign({}, nextPattern, { seed: seed + 1 })
    );

    return {
      currentPattern: currentPattern,
      nextPattern: nextPattern,
    };
  }

  // ---------------------------------------------------------------------------
  // Module export
  // ---------------------------------------------------------------------------
  if (typeof window.feedBackMinigamesPatternGenerator === "undefined") {
    window.feedBackMinigamesPatternGenerator = {};
  }
  window.feedBackMinigamesPatternGenerator.PatternGenerator = {
    generate: generate,
  };
})();