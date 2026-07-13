(function () {
  "use strict";

  var STATE = {
    IDLE: "idle",
    PROBING: "probing",
    LIVE: "live",
    DENIED_MIC: "denied-mic",
    DENIED_MIDI: "denied-midi",
    DENIED_BOTH: "denied-both",
    NOTEDETECT_MISSING: "notedetect-missing",
  };

  var MESSAGES = {
    idle: "No input detected — set up your input. Play a note and this dot lights up.",
    probing: "Checking input...",
    live: "Input detected — live!",
    "denied-mic": "Microphone access denied — enable it in your browser settings.",
    "denied-midi": "MIDI access denied — enable MIDI in your browser settings.",
    "denied-both": "Microphone and MIDI access denied — enable at least one in your browser settings.",
    "notedetect-missing": "Guitar input is not available — notedetect version requirement not met.",
  };

  function InputGate(container, opts) {
    opts = opts || {};
    this._container = container;
    this._onReadyChange = opts.onReadyChange || null;
    this._instrument = opts.instrument || "guitar";
    this._noteDetectBridge = opts.noteDetectBridge || null;
    this._state = STATE.IDLE;
    this._ready = false;
    this._el = null;
    this._dot = null;
    this._message = null;
    this._micStream = null;
    this._audioCtx = null;
    this._analyser = null;
    this._midiAccess = null;
    this._midiInputs = null;
    this._animationFrame = null;
    this._throttleTimer = 0;
  }

  InputGate.prototype.render = function () {
    var el = document.createElement("div");
    el.className = "bc-game-root__input-gate sticker-panel";

    // Test-hit indicator row
    var row = document.createElement("div");
    row.className = "bc-game-root__gate-row";

    var dot = document.createElement("span");
    dot.className = "bc-game-root__gate-dot";
    row.appendChild(dot);
    this._dot = dot;

    var msg = document.createElement("p");
    msg.className = "bc-game-root__gate-message";
    msg.textContent = MESSAGES[this._state];
    row.appendChild(msg);
    this._message = msg;

    el.appendChild(row);

    this._el = el;
    this._container.appendChild(el);

    this._startProbe();
  };

  InputGate.prototype.setInstrument = function (instrument) {
    this._instrument = instrument;
    this._teardownProbe();
    this._setState(STATE.IDLE);
    this._setReady(false);
    this._startProbe();
  };

  InputGate.prototype._startProbe = function () {
    if (this._instrument === "guitar") {
      // Check notedetect bridge before attempting mic probe
      var bridge = this._noteDetectBridge;
      if (bridge && !bridge.isAvailable()) {
        this._setState(STATE.NOTEDETECT_MISSING);
        return;
      }
      this._probeMic();
    } else {
      this._probeMidi();
    }
  };

  InputGate.prototype._probeMic = function () {
    var self = this;
    this._setState(STATE.PROBING);

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      this._setState(STATE.DENIED_MIC);
      return;
    }

    navigator.mediaDevices.getUserMedia({ audio: true }).then(function (stream) {
      self._micStream = stream;

      try {
        var AudioCtx = window.AudioContext || window.webkitAudioContext;
        self._audioCtx = new AudioCtx();
        self._analyser = self._audioCtx.createAnalyser();
        self._analyser.fftSize = 256;

        var source = self._audioCtx.createMediaStreamSource(stream);
        source.connect(self._analyser);

        self._watchMicLevel();
      } catch (e) {
        self._setState(STATE.LIVE);
        self._setReady(true);
      }
    }).catch(function (err) {
      if (err.name === "NotAllowedError" || err.name === "PermissionDeniedError") {
        self._setState(STATE.DENIED_MIC);
      } else {
        self._setState(STATE.DENIED_MIC);
      }
    });
  };

  InputGate.prototype._watchMicLevel = function () {
    var self = this;
    var data = new Uint8Array(this._analyser.frequencyBinCount);

    function check() {
      if (!self._analyser) return;
      self._analyser.getByteTimeDomainData(data);

      // Check if any sample exceeds the silence threshold
      var max = 0;
      for (var i = 0; i < data.length; i++) {
        var val = Math.abs(data[i] - 128);
        if (val > max) max = val;
      }

      // Threshold: 10 = very sensitive (whisper-level)
      if (max > 10 && self._state !== STATE.LIVE) {
        self._setState(STATE.LIVE);
        self._setReady(true);
        return;
      }

      self._animationFrame = requestAnimationFrame(check);
    }

    self._animationFrame = requestAnimationFrame(check);
  };

  InputGate.prototype._probeMidi = function () {
    var self = this;
    this._setState(STATE.PROBING);

    if (!navigator.requestMIDIAccess) {
      this._setState(STATE.DENIED_MIDI);
      return;
    }

    navigator.requestMIDIAccess().then(function (access) {
      self._midiAccess = access;

      var inputs = Array.from(access.inputs.values());
      self._midiInputs = inputs;

      if (inputs.length > 0) {
        // At least one MIDI device available
        self._setState(STATE.LIVE);
        self._setReady(true);
      } else {
        // No devices, but access granted — wait for connection
        self._setState(STATE.IDLE);
        self._message.textContent = "No MIDI device detected — connect one and play a note.";
      }

      access.onstatechange = function (e) {
        if (e.port.type === "input" && e.port.state === "connected") {
          self._midiInputs = Array.from(access.inputs.values());
          if (self._state !== STATE.LIVE) {
            self._setState(STATE.LIVE);
            self._setReady(true);
          }
        }
      };

      // Listen for note-on on any input
      inputs.forEach(function (input) {
        input.onmidimessage = function (msg) {
          if ((msg.data[0] & 0xf0) === 0x90 && msg.data[2] > 0) {
            // Note-on with velocity > 0
            if (self._state !== STATE.LIVE) {
              self._setState(STATE.LIVE);
              self._setReady(true);
            }
          }
        };
      });
    }).catch(function (err) {
      if (err.name === "NotAllowedError" || err.name === "SecurityError") {
        self._setState(STATE.DENIED_MIDI);
      } else {
        self._setState(STATE.DENIED_MIDI);
      }
    });
  };

  InputGate.prototype._setState = function (state) {
    this._state = state;
    this._updateUI();
  };

  InputGate.prototype._setReady = function (ready) {
    this._ready = ready;
    if (typeof this._onReadyChange === "function") {
      this._onReadyChange(ready);
    }
  };

  InputGate.prototype._updateUI = function () {
    if (!this._dot || !this._message) return;

    // Reset classes
    this._dot.className = "bc-game-root__gate-dot";

    var msg = MESSAGES[this._state];
    var isLive = this._state === STATE.LIVE;

    if (isLive) {
      this._dot.classList.add("bc-game-root__gate-dot--live");
    } else if (this._state === STATE.IDLE || this._state === STATE.PROBING) {
      this._dot.classList.add("bc-game-root__gate-dot--idle");
    } else {
      this._dot.classList.add("bc-game-root__gate-dot--error");
    }

    this._message.textContent = msg || MESSAGES.idle;
  };

  InputGate.prototype._teardownProbe = function () {
    if (this._animationFrame) {
      cancelAnimationFrame(this._animationFrame);
      this._animationFrame = null;
    }

    if (this._micStream) {
      this._micStream.getTracks().forEach(function (t) { t.stop(); });
      this._micStream = null;
    }

    if (this._audioCtx) {
      this._audioCtx.close().catch(function () {});
      this._audioCtx = null;
      this._analyser = null;
    }

    // Remove MIDI listeners
    if (this._midiInputs) {
      this._midiInputs.forEach(function (input) {
        input.onmidimessage = null;
      });
      this._midiInputs = null;
    }
    this._midiAccess = null;
  };

  InputGate.prototype.isReady = function () {
    return this._ready;
  };

  InputGate.prototype.getState = function () {
    return this._state;
  };

  InputGate.prototype.destroy = function () {
    this._teardownProbe();
    if (this._el && this._el.parentNode) {
      this._el.parentNode.removeChild(this._el);
    }
    this._container = null;
    this._el = null;
    this._dot = null;
    this._message = null;
  };

  if (typeof window.feedBackMinigamesInputGate === "undefined") {
    window.feedBackMinigamesInputGate = {};
  }
  window.feedBackMinigamesInputGate.InputGate = InputGate;

})();