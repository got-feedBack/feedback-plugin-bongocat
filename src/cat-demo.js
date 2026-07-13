// Bongo Cat's Rhythm Trainer — Cat Demo metronome visual (AD-7, NFR-13)
// Sprite-based Bongo Cat synchronised to beatClock (UX DESIGN.md "Cat
// Metronome and Instrument"): exactly three sprite states — both paws up
// (rest), left paw down, right paw down — tapping a fully visible,
// simplified instrument. Plays a metronome click during count-in and demo.
//
// Sprites live under assets/sprites/ and are served through the plugin
// asset route. Instrument sprites are optional: when the image 404s we
// fall back to the CSS-drawn instrument from the sticker-arcade mockup.

(function () {
  "use strict";

  var T = window.feedBackMinigamesTunables && window.feedBackMinigamesTunables.T;

  var PLUGIN_ID = "feedback-plugin-bongocat";
  var SPRITES = "/api/plugins/" + PLUGIN_ID + "/assets/sprites/";

  var CAT_SPRITE = {
    up: SPRITES + "cat-paws-up.png",
    left: SPRITES + "cat-left-paw.png",
    right: SPRITES + "cat-right-paw.png",
  };

  var INSTRUMENT_SPRITE = {
    guitar: SPRITES + "guitar.png",
    piano: SPRITES + "piano.png",
    drums: SPRITES + "drums.png", // no sprite yet — CSS bongos fallback
  };

  var STATE = {
    IDLE: "idle",
    COUNTING_IN: "counting-in",
    PLAYING: "playing",
    DONE: "done",
  };

  var LABELS = {
    idle: "",
    "counting-in": "Get Ready!",
    playing: "Go!",
    done: "Nice!",
  };

  function CatDemo(container, opts) {
    opts = opts || {};
    if (!container) throw new Error("CatDemo requires a container element");

    this._container = container;
    this._beatClock = opts.beatClock || null;
    this._onStateChange = opts.onStateChange || null;
    this._bpm = opts.bpm || (T ? T.BPM_DEFAULT_LEARNING : 80);
    this._countInBeats = opts.countInBeats || (T ? T.COUNT_IN_LENGTH_BEATS : 4);
    this._demoBeats = opts.demoBeats || 4;
    this._instrument = opts.instrument || "drums";
    // Phase labels. The demo label replaces the generic "Go!" while the
    // cat performs; the response label marks the player's window.
    this._demoLabel = opts.demoLabel || LABELS.playing;
    this._responseLabel = opts.responseLabel || null;
    // Pattern to perform during the demo phase (learning mode). When null
    // the demo phase falls back to a plain quarter-note metronome.
    this._pattern = null;
    // Beats of metronome to keep tapping AFTER the demo phase (the
    // response window in learning mode — CAP-3: paw hit on every beat).
    this._responseBeats = 0;

    this._state = STATE.IDLE;
    this._beatIndex = 0;
    this._scheduledIds = [];
    // Generation token: beatClock.scheduleAtBeat is setTimeout-based and
    // can't be cancelled, so stop() bumps the generation and stale
    // callbacks self-discard. Without this, a long calibration metronome
    // keeps tapping 4/4 into the actual run.
    this._gen = 0;
    this._audioCtx = null;
    this._pawResetTimer = null;

    this._el = null;
    this._labelEl = null;
    this._spriteEl = null;
    this._instrumentEl = null;
    this._beatCountEl = null;
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  CatDemo.prototype.render = function () {
    if (this._el) return;
    this._buildDOM();
    this._container.appendChild(this._el);
  };

  /**
   * Set the pattern the cat performs in the demo phase. Pass null for a
   * plain every-beat metronome (challenge mode).
   */
  CatDemo.prototype.setPattern = function (pattern) {
    this._pattern = pattern || null;
  };

  /**
   * Beats of metronome tapping appended after the demo phase (the
   * response window). 0 disables the extra phase.
   */
  CatDemo.prototype.setResponseBeats = function (beats) {
    this._responseBeats = beats || 0;
  };

  CatDemo.prototype.setInstrument = function (instrument) {
    this._instrument = instrument;
    if (this._instrumentEl) {
      var parent = this._instrumentEl.parentNode;
      parent.removeChild(this._instrumentEl);
      this._instrumentEl = this._buildInstrument();
      parent.appendChild(this._instrumentEl);
    }
  };

  /**
   * Queue the NEXT cycle's performance. Consumed at the current cycle's
   * end ON the beat clock, so the next bar's downbeat is scheduled before
   * (not after) it is due — grading, which runs ~0.14 beats past the next
   * downbeat, must never be in the audio path.
   */
  CatDemo.prototype.queueNext = function (spec) {
    this._queued = spec || null;
  };

  CatDemo.prototype._maybeChain = function () {
    var q = this._queued;
    if (!q) return false;
    this._queued = null;
    this._startBeat = q.atBeat;
    this._pattern = q.pattern || null;
    if (typeof q.responseBeats === "number") this._responseBeats = q.responseBeats;
    // Cycles have no count-in — re-enter the phase chain at the demo.
    this._onPhaseEnd(STATE.COUNTING_IN);
    return true;
  };

  /**
   * One externally-driven metronome pulse: paw tap + click. Used by the
   * controller's count-in, which owns its own beat schedule.
   */
  CatDemo.prototype.pulse = function (index) {
    if (!this._audioCtx && this._beatClock) {
      this._audioCtx = this._beatClock.getAudioContext();
    }
    this._tapPaw(index);
    this._playMetronomeClick();
  };

  CatDemo.prototype.setLabels = function (demoLabel, responseLabel) {
    if (demoLabel) this._demoLabel = demoLabel;
    if (responseLabel !== undefined) this._responseLabel = responseLabel;
  };

  CatDemo.prototype.setCountInBeats = function (beats) {
    this._countInBeats = beats || 0;
  };

  CatDemo.prototype.setDemoBeats = function (beats) {
    this._demoBeats = beats || 4;
  };

  /**
   * Start a cycle at an absolute beat on the (continuous) beat clock.
   * Restarting the clock between bars caused an audible gap — instead the
   * controller keeps one running timeline and passes each cycle's start.
   */
  CatDemo.prototype.start = function (atBeat) {
    if (this._state !== STATE.IDLE) return;
    this._audioCtx = this._beatClock
      ? this._beatClock.getAudioContext()
      : null;
    this._beatIndex = 0;
    this._startBeat = atBeat || 0;
    this._transition(STATE.COUNTING_IN);
    if (this._countInBeats > 0) {
      this._schedulePhase(this._startBeat, this._countInBeats, STATE.COUNTING_IN);
    } else {
      // No count-in: go straight to the demo/metronome phase.
      this._onPhaseEnd(STATE.COUNTING_IN);
    }
  };

  CatDemo.prototype.stop = function () {
    this._cancelScheduled();
    this._queued = null;
    this._beatIndex = 0;
    this._setPawState("up");
    this._transition(STATE.IDLE);
  };

  CatDemo.prototype.reset = function () {
    this.stop();
  };

  CatDemo.prototype.getState = function () {
    return this._state;
  };

  CatDemo.prototype.destroy = function () {
    this.stop();
    if (this._el && this._el.parentNode) {
      this._el.parentNode.removeChild(this._el);
    }
    this._container = null;
    this._el = null;
    this._labelEl = null;
    this._spriteEl = null;
    this._instrumentEl = null;
    this._beatCountEl = null;
    this._audioCtx = null;
  };

  // ---------------------------------------------------------------------------
  // DOM construction — sprite cat over a simplified instrument (mockup layout)
  // ---------------------------------------------------------------------------

  CatDemo.prototype._buildDOM = function () {
    var el = document.createElement("div");
    el.className = "bc-game-root__cat-demo";

    // Label (aria-live region for screen readers)
    var label = document.createElement("div");
    label.className = "bc-game-root__cat-demo-label";
    label.setAttribute("aria-live", "polite");
    label.textContent = "";
    el.appendChild(label);
    this._labelEl = label;

    // Cat zone: sprite at the bottom, body cut off by the frame edge.
    var zone = document.createElement("div");
    zone.className = "bc-game-root__cat-zone";
    el.appendChild(zone);

    var cat = document.createElement("div");
    cat.className = "bc-game-root__cat";
    zone.appendChild(cat);

    // All sprites share one 800×800 canvas and stack at the same position:
    // instrument layer first (below), cat layer on top (paws over the
    // instrument).
    this._instrumentEl = this._buildInstrument();
    cat.appendChild(this._instrumentEl);

    var sprite = document.createElement("img");
    sprite.className = "bc-game-root__cat-sprite";
    sprite.src = CAT_SPRITE.up;
    sprite.alt = "Bongo Cat";
    sprite.draggable = false;
    cat.appendChild(sprite);
    this._spriteEl = sprite;

    // (No beat counter — the count-in overlay and the notation strip's
    // active slot already communicate position; _updateBeatCount no-ops
    // against the null element.)
    this._beatCountEl = null;

    this._el = el;
  };

  // Instrument element: sprite <img> preferred; on load error swap in the
  // CSS-drawn fallback from the sticker-arcade mockup so the stage never
  // shows a broken image.
  CatDemo.prototype._buildInstrument = function () {
    var self = this;
    var instrument = this._instrument;

    var wrap = document.createElement("div");
    wrap.className =
      "bc-game-root__instrument bc-game-root__instrument--" + instrument;

    var img = document.createElement("img");
    img.className = "bc-game-root__instrument-sprite";
    img.src = INSTRUMENT_SPRITE[instrument] || INSTRUMENT_SPRITE.drums;
    img.alt = "";
    img.draggable = false;
    img.onerror = function () {
      if (img.parentNode) img.parentNode.removeChild(img);
      wrap.appendChild(self._buildInstrumentFallback(instrument));
    };
    wrap.appendChild(img);

    return wrap;
  };

  CatDemo.prototype._buildInstrumentFallback = function (instrument) {
    var el = document.createElement("div");
    el.className = "bc-game-root__instrument-css bc-game-root__instrument-css--" + instrument;

    if (instrument === "piano") {
      // Small keyboard: white keys with two flats.
      for (var i = 0; i < 5; i++) {
        var key = document.createElement("div");
        key.className = "bc-game-root__instr-key";
        el.appendChild(key);
        if (i === 0 || i === 2) {
          var flat = document.createElement("div");
          flat.className = "bc-game-root__instr-key bc-game-root__instr-key--flat";
          el.appendChild(flat);
        }
      }
    } else if (instrument === "guitar") {
      var body = document.createElement("div");
      body.className = "bc-game-root__instr-guitar-body";
      var neck = document.createElement("div");
      neck.className = "bc-game-root__instr-guitar-neck";
      var strings = document.createElement("div");
      strings.className = "bc-game-root__instr-guitar-strings";
      el.appendChild(neck);
      el.appendChild(strings);
      el.appendChild(body);
    } else {
      // Bongos (drums default)
      var l = document.createElement("div");
      l.className = "bc-game-root__instr-bongo bc-game-root__instr-bongo--left";
      var r = document.createElement("div");
      r.className = "bc-game-root__instr-bongo bc-game-root__instr-bongo--right";
      el.appendChild(l);
      el.appendChild(r);
    }
    return el;
  };

  // ---------------------------------------------------------------------------
  // Phase scheduling
  // ---------------------------------------------------------------------------

  CatDemo.prototype._schedulePhase = function (startBeat, count, phase) {
    var self = this;
    this._cancelScheduled();
    var gen = this._gen;

    var scheduleBeat = function (beat, idx) {
      if (self._beatClock && typeof self._beatClock.scheduleAtBeat === "function") {
        self._beatClock.scheduleAtBeat(beat, function () {
          if (gen !== self._gen) return; // stale — stop() was called
          self._onBeat(idx, phase); // phase-relative for paw/beat display
        });
      }
    };
    for (var i = 0; i < count; i++) {
      scheduleBeat(startBeat + i, i);
    }

    // Schedule the phase-end transition
    var endBeat = startBeat + count;
    if (this._beatClock && typeof this._beatClock.scheduleAtBeat === "function") {
      this._beatClock.scheduleAtBeat(endBeat, function () {
        if (gen !== self._gen) return;
        self._onPhaseEnd(phase);
      });
    }
  };

  CatDemo.prototype._onBeat = function (beatIndex, phase) {
    this._beatIndex = beatIndex;
    this._animatePaw(beatIndex);
    this._playMetronomeClick();
    this._updateBeatCount(beatIndex + 1);
  };

  CatDemo.prototype._onPhaseEnd = function (phase) {
    var base = this._startBeat || 0;
    if (phase === STATE.COUNTING_IN) {
      this._transition(STATE.PLAYING);
      this._setLabelText(this._demoLabel);
      if (this._pattern) {
        // Demo phase performs the actual pattern: paw taps land on the
        // pattern's expected onsets, clicks keep marking every beat.
        this._schedulePatternPlay(base + this._countInBeats, this._pattern, this._demoBeats);
      } else {
        // No pattern (challenge): plain every-beat metronome.
        this._schedulePhase(base + this._countInBeats, this._demoBeats, STATE.PLAYING);
      }
    } else if (phase === STATE.PLAYING) {
      if (this._responseBeats > 0) {
        // Player's response window: the cat keeps performing the RHYTHM
        // (not a bare 4/4) so the player has the actual figure to lock
        // onto; metronome only when no pattern is set.
        this._setLabelText(this._responseLabel || this._demoLabel);
        var start = base + this._countInBeats + this._demoBeats;
        if (this._pattern) {
          this._schedulePatternPlay(start, this._pattern, this._responseBeats, "response");
        } else {
          this._scheduleResponseMetronome(start, this._responseBeats);
        }
      } else {
        if (this._maybeChain()) return; // roll into the queued next cycle
        this._setPawState("up");
        this._transition(STATE.DONE);
      }
    } else if (phase === "response") {
      if (this._maybeChain()) return; // roll into the queued next cycle
      this._setPawState("up");
      this._transition(STATE.DONE);
    }
  };

  // Demo phase: the cat PERFORMS the pattern — paw tap AND click land
  // together on each expected onset, so what you hear is what you play.
  // The beat counter still advances on whole beats (silent).
  CatDemo.prototype._schedulePatternPlay = function (startBeat, pattern, lengthBeats, endPhase) {
    var self = this;
    this._cancelScheduled();
    var gen = this._gen;
    endPhase = endPhase || STATE.PLAYING;

    // Silent beat counter on every beat
    for (var b = 0; b < lengthBeats; b++) {
      (function (beat) {
        if (self._beatClock && typeof self._beatClock.scheduleAtBeat === "function") {
          self._beatClock.scheduleAtBeat(startBeat + beat, function () {
            if (gen !== self._gen) return;
            self._updateBeatCount(beat + 1);
          });
        }
      })(b);
    }

    // Paw tap + click on each of the pattern's expected onsets
    var onsets = pattern.expectedOnsets || [];
    for (var i = 0; i < onsets.length; i++) {
      (function (onsetBeat, idx) {
        if (onsetBeat >= lengthBeats) return;
        if (self._beatClock && typeof self._beatClock.scheduleAtBeat === "function") {
          self._beatClock.scheduleAtBeat(startBeat + onsetBeat, function () {
            if (gen !== self._gen) return;
            self._tapPaw(idx);
            self._playMetronomeClick();
          });
        }
      })(onsets[i], i);
    }

    if (this._beatClock && typeof this._beatClock.scheduleAtBeat === "function") {
      this._beatClock.scheduleAtBeat(startBeat + lengthBeats, function () {
        if (gen !== self._gen) return;
        self._onPhaseEnd(endPhase);
      });
    }
  };

  // Response window: every-beat metronome taps, then done.
  CatDemo.prototype._scheduleResponseMetronome = function (startBeat, beats) {
    var self = this;
    var gen = this._gen;
    for (var b = 0; b < beats; b++) {
      (function (beat) {
        if (self._beatClock && typeof self._beatClock.scheduleAtBeat === "function") {
          self._beatClock.scheduleAtBeat(startBeat + beat, function () {
            if (gen !== self._gen) return;
            self._onBeat(beat, "response");
          });
        }
      })(b);
    }
    if (this._beatClock && typeof this._beatClock.scheduleAtBeat === "function") {
      this._beatClock.scheduleAtBeat(startBeat + beats, function () {
        if (gen !== self._gen) return;
        self._onPhaseEnd("response");
      });
    }
  };

  // ---------------------------------------------------------------------------
  // Paw animation — sprite swap, alternating left/right on each beat.
  // Reverts to both-paws-up between taps (three sprite states total).
  // ---------------------------------------------------------------------------

  CatDemo.prototype._animatePaw = function (beatIndex) {
    this._tapPaw(beatIndex);
  };

  CatDemo.prototype._tapPaw = function (index) {
    var state = index % 2 === 0 ? "left" : "right";
    this._setPawState(state);

    var self = this;
    if (this._pawResetTimer) clearTimeout(this._pawResetTimer);
    this._pawResetTimer = setTimeout(function () {
      self._setPawState("up");
    }, 100);
  };

  CatDemo.prototype._setPawState = function (state) {
    if (this._spriteEl) {
      this._spriteEl.src = CAT_SPRITE[state] || CAT_SPRITE.up;
    }
    if (this._instrumentEl) {
      var hit = state === "left" || state === "right";
      this._instrumentEl.classList.toggle("bc-game-root__instrument--hit", hit);
    }
    this._pawState = state;
  };

  CatDemo.prototype.getPawState = function () {
    return this._pawState || "up";
  };

  // ---------------------------------------------------------------------------
  // Metronome click via Web Audio API
  // ---------------------------------------------------------------------------

  CatDemo.prototype._playMetronomeClick = function () {
    var ctx = this._audioCtx;
    if (!ctx) return;

    try {
      // Short percussive click
      var osc = ctx.createOscillator();
      var gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.frequency.value = 800;
      osc.type = "sine";

      var now = ctx.currentTime;
      gain.gain.setValueAtTime(0.25, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);

      osc.start(now);
      osc.stop(now + 0.04);
    } catch (e) {
      // Silently ignore audio errors (e.g. missing AudioContext)
    }
  };

  // ---------------------------------------------------------------------------
  // UI updates
  // ---------------------------------------------------------------------------

  CatDemo.prototype._updateBeatCount = function (count) {
    if (this._beatCountEl) {
      this._beatCountEl.textContent = count.toString();
    }
  };

  CatDemo.prototype._setLabelText = function (text) {
    if (this._labelEl && text) {
      this._labelEl.textContent = text;
    }
  };

  CatDemo.prototype._updateLabel = function () {
    if (this._labelEl) {
      this._labelEl.textContent = LABELS[this._state] || "";
    }
  };

  CatDemo.prototype._updateBodyClass = function () {
    // Set state class on the root element for CSS hooks
    if (this._el) {
      this._el.className = "bc-game-root__cat-demo";
      if (this._state !== STATE.IDLE) {
        this._el.classList.add(
          "bc-game-root__cat-demo--" + this._state
        );
      }
    }
  };

  // ---------------------------------------------------------------------------
  // State management
  // ---------------------------------------------------------------------------

  CatDemo.prototype._transition = function (newState) {
    var oldState = this._state;
    this._state = newState;
    this._updateLabel();
    this._updateBodyClass();
    if (typeof this._onStateChange === "function") {
      this._onStateChange(oldState, newState);
    }
  };

  CatDemo.prototype._cancelScheduled = function () {
    this._gen++; // invalidate every outstanding beat-clock callback
    for (var i = 0; i < this._scheduledIds.length; i++) {
      clearTimeout(this._scheduledIds[i]);
    }
    this._scheduledIds = [];
    if (this._pawResetTimer) {
      clearTimeout(this._pawResetTimer);
      this._pawResetTimer = null;
    }
  };

  // ---------------------------------------------------------------------------
  // Module export
  // ---------------------------------------------------------------------------

  CatDemo.STATE = STATE;
  CatDemo.SPRITES = CAT_SPRITE;

  if (typeof window.feedBackMinigamesCatDemo === "undefined") {
    window.feedBackMinigamesCatDemo = {};
  }
  window.feedBackMinigamesCatDemo.CatDemo = CatDemo;
})();
