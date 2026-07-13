// Bongo Cat's Rhythm Trainer — Input Adapter (AD-4, NFR-2, NFR-4)
// Normalizes onsets from guitar (notedetect) and MIDI sources into Onset records.
// Onset = { sourceInstrument, beatTime, timestamp }
// Guitar: calibration offset applied from localStorage; MIDI: raw timestamp used.

(function () {
  "use strict";

  var STORAGE_PREFIX = "bongocat.calibration.";

  var T = window.feedBackMinigamesTunables && window.feedBackMinigamesTunables.T;

  // ---------------------------------------------------------------------------
  // InputAdapter
  // ---------------------------------------------------------------------------

  function InputAdapter(opts) {
    opts = opts || {};
    this._instrument = opts.instrument || "guitar";
    this._onOnset = opts.onOnset || null;
    this._noteDetectBridge = opts.noteDetectBridge || null;
    this._beatClock = opts.beatClock || null;
    this._bpm = opts.bpm || 80;

    // Debounce state
    this._lastOnsetTimestamp = 0;
    this._debounceWindowMs = (T && T.DOUBLE_TRIGGER_WINDOW_MS) || 50;

    // MIDI state
    this._midiInputs = [];
    this._midiAccess = null;

    // Calibration
    this._calibrationOffset = 0;

    // Attached flag
    this._attached = false;

    // Load calibration on construction
    this._loadCalibration();
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  InputAdapter.prototype.setInstrument = function (instrument) {
    this._instrument = instrument;
    this._loadCalibration();
  };

  InputAdapter.prototype.setBpm = function (bpm) {
    this._bpm = bpm;
  };

  InputAdapter.prototype.setBeatClock = function (beatClock) {
    this._beatClock = beatClock;
  };

  InputAdapter.prototype.setNoteDetectBridge = function (bridge) {
    this._noteDetectBridge = bridge;
  };

  InputAdapter.prototype.setDebounceWindow = function (ms) {
    this._debounceWindowMs = ms;
  };

  InputAdapter.prototype.getCalibrationOffset = function () {
    return this._calibrationOffset;
  };

  // ---------------------------------------------------------------------------
  // Attach / Detach input listeners
  // ---------------------------------------------------------------------------

  InputAdapter.prototype.attachMidi = function () {
    var self = this;
    var diag = typeof window !== "undefined" && window.bongocatDiag;
    if (!navigator.requestMIDIAccess) {
      if (diag) diag.log("midi.unavailable", { reason: "no navigator.requestMIDIAccess" });
      return false;
    }

    navigator.requestMIDIAccess().then(function (access) {
      self._midiAccess = access;
      self._midiInputs = Array.from(access.inputs.values());
      if (diag) {
        diag.log("midi.attached", {
          inputs: self._midiInputs.map(function (i) { return i.name || i.id; }),
        });
      }

      self._midiInputs.forEach(function (input) {
        input.onmidimessage = function (msg) {
          // Note-on with velocity > 0
          if ((msg.data[0] & 0xf0) === 0x90 && msg.data[2] > 0) {
            self._handleMidiOnset(msg);
          }
        };
      });

      // Listen for future MIDI connections
      access.onstatechange = function (e) {
        if (e.port.type === "input" && e.port.state === "connected") {
          e.port.onmidimessage = function (msg) {
            if ((msg.data[0] & 0xf0) === 0x90 && msg.data[2] > 0) {
              self._handleMidiOnset(msg);
            }
          };
          self._midiInputs.push(e.port);
        }
      };

      self._attached = true;
    }).catch(function (e) {
      // MIDI access denied — degrade, but leave a trace
      if (diag) diag.log("midi.denied", { error: String(e) });
    });

    return true;
  };

  InputAdapter.prototype.detachMidi = function () {
    this._midiInputs.forEach(function (input) {
      input.onmidimessage = null;
    });
    this._midiInputs = [];
    this._midiAccess = null;
    this._attached = false;
  };

  // ---------------------------------------------------------------------------
  // Raw onset pipeline (called by notedetect bridge or externally)
  // ---------------------------------------------------------------------------

  /**
   * Handle a raw onset from any source.
   * Called by the notedetect containment listener or MIDI handler.
   *
   * @param {string} sourceInstrument - "guitar" or "piano" / "drums"
   * @param {number} rawTimestamp     - performance.now() value (ms) from the input event
   */
  InputAdapter.prototype.handleRawOnset = function (sourceInstrument, rawTimestamp) {
    var diag = typeof window !== "undefined" && window.bongocatDiag;

    // Filter: drop onsets from non-selected instruments
    if (sourceInstrument !== this._instrument) {
      if (diag) diag.log("input.filtered", { reason: "instrument-mismatch", source: sourceInstrument, selected: this._instrument });
      return null;
    }

    // Debounce: discard if within debounce window of last onset
    if (rawTimestamp - this._lastOnsetTimestamp < this._debounceWindowMs) {
      if (diag) diag.log("input.filtered", { reason: "debounce", deltaMs: rawTimestamp - this._lastOnsetTimestamp });
      return null;
    }
    this._lastOnsetTimestamp = rawTimestamp;

    // Compute beatTime
    var beatTime = this._computeBeatTime(rawTimestamp);

    // Apply calibration offset for guitar only
    var adjustedTimestamp = rawTimestamp;
    if (sourceInstrument === "guitar") {
      adjustedTimestamp = rawTimestamp - this._calibrationOffset;
      // Recompute beatTime with adjustment
      beatTime = this._computeBeatTime(adjustedTimestamp);
    }

    var onset = {
      sourceInstrument: sourceInstrument,
      beatTime: beatTime,
      timestamp: adjustedTimestamp,
    };

    if (typeof this._onOnset === "function") {
      this._onOnset(onset);
    }

    return onset;
  };

  // ---------------------------------------------------------------------------
  // External onset injection (for test / integration use)
  // ---------------------------------------------------------------------------

  /**
   * Inject an onset directly (bypasses debounce, used by notedetect verdicts).
   * Returns the Onset record, or null if filtered.
   */
  InputAdapter.prototype.injectOnset = function (sourceInstrument, beatTime, timestamp) {
    if (sourceInstrument !== this._instrument) return null;

    var onset = {
      sourceInstrument: sourceInstrument,
      beatTime: beatTime,
      timestamp: timestamp,
    };

    if (typeof this._onOnset === "function") {
      this._onOnset(onset);
    }

    return onset;
  };

  // ---------------------------------------------------------------------------
  // Mini-chart derivation from Pattern
  // ---------------------------------------------------------------------------

  /**
   * Derive a mini-chart from a Pattern for the Judge.
   * Mini-chart onsets have maximally wide hit windows from tunables.
   *
   * @param {Object} pattern - Pattern object with expectedOnsets array
   * @returns {Object} miniChart - { onsets: [{ beatTime, hitWindowStart, hitWindowEnd }] }
   */
  InputAdapter.prototype.deriveMiniChart = function (pattern) {
    if (!pattern || !pattern.expectedOnsets || !pattern.expectedOnsets.length) {
      return { onsets: [] };
    }

    var perfectInnerMs = (T && T.PERFECT_INNER_MS) || 25;
    var goodOuterMs = (T && T.GOOD_OUTER_MS) || 60;

    // Convert ms windows to beat-time windows at current BPM
    var msPerBeat = 60000 / this._bpm;

    var onsets = pattern.expectedOnsets.map(function (beatTime) {
      return {
        beatTime: beatTime,
        hitWindowStart: beatTime - (goodOuterMs / msPerBeat),
        hitWindowEnd: beatTime + (goodOuterMs / msPerBeat),
      };
    });

    return { onsets: onsets };
  };

  // ---------------------------------------------------------------------------
  // Internal helpers
  // ---------------------------------------------------------------------------

  InputAdapter.prototype._computeBeatTime = function (timestampMs) {
    if (!this._beatClock || !this._beatClock.isRunning()) return 0;
    var nowBeat = this._beatClock.beatTime();
    // Honor the event's own timestamp: detection latency (YIN lock-on,
    // MIDI transport) means the event is processed AFTER the physical
    // onset — stamping "now" would bake that latency into every grade.
    if (typeof timestampMs === "number" && isFinite(timestampMs) &&
        typeof performance !== "undefined" && performance.now) {
      var ageMs = performance.now() - timestampMs;
      if (ageMs > 0 && typeof this._beatClock.msToBeats === "function") {
        return nowBeat - this._beatClock.msToBeats(ageMs);
      }
    }
    return nowBeat;
  };

  InputAdapter.prototype._loadCalibration = function () {
    this._calibrationOffset = 0;
    if (this._instrument !== "guitar") return;

    try {
      var key = STORAGE_PREFIX + "mic-default";
      var raw = localStorage.getItem(key);
      if (raw !== null) {
        var val = parseInt(raw, 10);
        if (!isNaN(val)) {
          this._calibrationOffset = val;
        }
      }
    } catch (e) {
      // localStorage unavailable — leave offset at 0
    }
  };

  InputAdapter.prototype._handleMidiOnset = function (msg) {
    // MIDI timestamp comes from the event's receivedTime or performance.now()
    var timestamp = msg.receivedTime || performance.now();
    var sourceInstrument = this._instrument; // piano or drums — already filtered in handleRawOnset

    this.handleRawOnset(sourceInstrument, timestamp);
  };

  // ---------------------------------------------------------------------------
  // Module export
  // ---------------------------------------------------------------------------

  if (typeof window.feedBackMinigamesInputAdapter === "undefined") {
    window.feedBackMinigamesInputAdapter = {};
  }
  window.feedBackMinigamesInputAdapter.InputAdapter = InputAdapter;

})();