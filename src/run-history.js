(function () {
  "use strict";

  var PLUGIN_ID = "feedback-plugin-bongocat";

  /**
   * RunHistory — persists completed runs and retrieves the latest run
   * for a given user via the plugin's routes.py API.
   *
   * Usage:
   *   var rh = new RunHistory(sdk);
   *   rh.saveRun(runData, function (err) { ... });
   *   rh.fetchLatest(function (err, run) { ... });
   */
  function RunHistory(sdk) {
    if (!sdk) {
      throw new Error("RunHistory: sdk is required");
    }
    this._sdk = sdk;
  }

  /**
   * Store a completed run.
   *
   * @param {Object} runData  — fields: user_id, instrument, mode, bpm, score,
   *                            duration_ms, avg_timing_error_ms, patterns_survived,
   *                            modifiers, summary_html
   * @param {Function} cb     — callback(err): err is null on success
   */
  RunHistory.prototype.saveRun = function (runData, cb) {
    cb = cb || function () {};
    if (!runData || typeof runData !== "object") {
      cb(new Error("RunHistory.saveRun: runData must be an object"));
      return;
    }

    var self = this;
    this._resolveUserId(function (err, userId) {
      if (err) {
        cb(err);
        return;
      }

      runData.user_id = userId;

      var xhr = new XMLHttpRequest();
      xhr.open("POST", "/api/plugins/" + PLUGIN_ID + "/runs", true);
      xhr.setRequestHeader("Content-Type", "application/json");
      xhr.onload = function () {
        if (xhr.status === 201) {
          cb(null);
        } else {
          cb(new Error("RunHistory.saveRun: server returned " + xhr.status));
        }
      };
      xhr.onerror = function () {
        cb(new Error("RunHistory.saveRun: network error"));
      };
      xhr.send(JSON.stringify(runData));
    });
  };

  /**
   * Fetch the latest run for the current user.
   *
   * @param {Function} cb  — callback(err, run): run is null if no runs exist
   */
  RunHistory.prototype.fetchLatest = function (cb) {
    cb = cb || function () {};
    var self = this;

    this._resolveUserId(function (err, userId) {
      if (err) {
        cb(err);
        return;
      }

      var xhr = new XMLHttpRequest();
      xhr.open(
        "GET",
        "/api/plugins/" + PLUGIN_ID +
          "/runs/latest?user_id=" + encodeURIComponent(userId),
        true
      );
      xhr.onload = function () {
        if (xhr.status === 200) {
          try {
            cb(null, JSON.parse(xhr.responseText));
          } catch (e) {
            cb(new Error("RunHistory.fetchLatest: failed to parse response"));
          }
        } else if (xhr.status === 204) {
          cb(null, null);
        } else {
          cb(new Error("RunHistory.fetchLatest: server returned " + xhr.status));
        }
      };
      xhr.onerror = function () {
        cb(new Error("RunHistory.fetchLatest: network error"));
      };
      xhr.send();
    });
  };

  /**
   * Resolve the current user ID from the SDK profile.
   * Caches the result for subsequent calls.
   */
  RunHistory.prototype._resolveUserId = function (cb) {
    if (this._cachedUserId) {
      cb(null, this._cachedUserId);
      return;
    }

    var self = this;
    this._sdk.getProfile().then(function (profile) {
      // The minigames profile is single-user and carries no id field —
      // fall back to a stable local identity rather than failing the save.
      var userId = (profile && profile.id) || "local";
      self._cachedUserId = userId;
      cb(null, userId);
    }).catch(function (err) {
      cb(new Error("RunHistory: failed to get profile: " + (err.message || err)));
    });
  };

  /**
   * Clear the cached user ID (useful for testing or log-out scenarios).
   */
  RunHistory.prototype.clearCache = function () {
    this._cachedUserId = null;
  };

  // ---------------------------------------------------------------------------
  // Export
  // ---------------------------------------------------------------------------
  if (typeof window.feedBackMinigamesRunHistory === "undefined") {
    window.feedBackMinigamesRunHistory = {};
  }
  window.feedBackMinigamesRunHistory.RunHistory = RunHistory;
})();