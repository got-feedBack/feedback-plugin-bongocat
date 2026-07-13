(function () {
  "use strict";

  var MIN_VERSION = "1.10.0";

  function parseVersion(v) {
    if (typeof v !== "string") return [0, 0, 0];
    var parts = v.split(".").map(function (s) {
      var n = parseInt(s, 10);
      return isNaN(n) ? 0 : n;
    });
    while (parts.length < 3) parts.push(0);
    return parts;
  }

  function gte(a, b) {
    for (var i = 0; i < 3; i++) {
      if (a[i] > b[i]) return true;
      if (a[i] < b[i]) return false;
    }
    return true; // equal
  }

  function NoteDetectBridge() {
    this._available = false;
    this._version = null;
    this._originalHighway = null;
    this._containmentActive = false;
    this._restored = false;
  }

  NoteDetectBridge.prototype.init = function () {
    try {
      var nd = window.noteDetect;
      if (!nd) {
        console.warn("BongoCat: notedetect not found — Guitar input unavailable.");
        this._available = false;
        return;
      }

      var ver = nd.version || nd.VERSION || null;

      if (ver) {
        // Version-gate only when the instance actually reports a version
        // string. (The real notedetect plugin doesn't — see below.)
        this._version = ver;
        var parsed = parseVersion(ver);
        var min = parseVersion(MIN_VERSION);

        if (!gte(parsed, min)) {
          console.warn(
            "BongoCat: notedetect version " + ver +
            " is below minimum " + MIN_VERSION + " — Guitar input unavailable."
          );
          this._available = false;
          return;
        }
      } else {
        // The shipped notedetect exposes no version property on
        // window.noteDetect — its API is capability-shaped. Probe for the
        // contained-playback verifier (added well after 1.10.0) instead of
        // rejecting as "0.0.0".
        this._version = "unknown";
        if (typeof nd.setContainedChart !== "function") {
          console.warn(
            "BongoCat: notedetect lacks the contained-playback API " +
            "(setContainedChart) — Guitar input unavailable."
          );
          this._available = false;
          return;
        }
      }

      this._available = true;
      console.info("BongoCat: notedetect v" + this._version + " detected — Guitar available.");
    } catch (e) {
      console.warn("BongoCat: notedetect probe failed:", e);
      this._available = false;
    }
  };

  NoteDetectBridge.prototype.applyContainment = function () {
    if (!this._available) return;
    if (this._containmentActive) return;

    try {
      var nd = window.noteDetect;
      if (!nd) return;

      // Save original highway behavior (flappy-bend pattern)
      if (typeof nd.highway !== "undefined") {
        this._originalHighway = nd.highway;
      } else if (typeof nd.containedPlayback !== "undefined") {
        this._originalHighway = nd.containedPlayback;
      }

      // Disable highway behavior
      if (typeof nd.highway !== "undefined") {
        nd.highway = null;
      }
      if (typeof nd.setContainedChart !== "undefined") {
        // The contained-playback API is available, leave it accessible
      }

      this._containmentActive = true;
      this._restored = false;
      console.info("BongoCat: notedetect containment active.");
    } catch (e) {
      console.warn("BongoCat: containment apply failed:", e);
    }
  };

  NoteDetectBridge.prototype.restore = function () {
    if (this._restored) return;
    if (!this._containmentActive && !this._originalHighway) return;

    try {
      var nd = window.noteDetect;
      if (nd && this._originalHighway !== null) {
        nd.highway = this._originalHighway;
      }

      this._containmentActive = false;
      this._restored = true;
      this._originalHighway = null;
      console.info("BongoCat: notedetect containment restored.");
    } catch (e) {
      console.warn("BongoCat: restoration failed:", e);
    }
  };

  NoteDetectBridge.prototype.isAvailable = function () {
    return this._available;
  };

  NoteDetectBridge.prototype.getVersion = function () {
    return this._version;
  };

  NoteDetectBridge.prototype.getContainedPlaybackAPI = function () {
    if (!this._available) return null;
    try {
      var nd = window.noteDetect;
      if (!nd) return null;
      return {
        setContainedChart: typeof nd.setContainedChart === "function" ? nd.setContainedChart.bind(nd) : null,
        pushContainedPlayhead: typeof nd.pushContainedPlayhead === "function" ? nd.pushContainedPlayhead.bind(nd) : null,
        drainContainedVerdicts: typeof nd.drainContainedVerdicts === "function" ? nd.drainContainedVerdicts.bind(nd) : null,
        releaseContainedChart: typeof nd.releaseContainedChart === "function" ? nd.releaseContainedChart.bind(nd) : null,
      };
    } catch (e) {
      console.warn("BongoCat: failed to get contained-playback API:", e);
      return null;
    }
  };

  NoteDetectBridge.prototype.destroy = function () {
    this.restore();
    this._available = false;
    this._version = null;
  };

  if (typeof window.feedBackMinigamesNoteDetect === "undefined") {
    window.feedBackMinigamesNoteDetect = {};
  }
  window.feedBackMinigamesNoteDetect.NoteDetectBridge = NoteDetectBridge;
  window.feedBackMinigamesNoteDetect.parseVersion = parseVersion;
  window.feedBackMinigamesNoteDetect.gte = gte;
})();