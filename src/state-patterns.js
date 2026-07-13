(function () {
  "use strict";

  function StatePatterns(container, opts) {
    opts = opts || {};
    this._container = container;
    this._onEscape = opts.onEscape || null;
    this._onEnter = opts.onEnter || null;
    this._focusTrap = opts.focusTrap !== false;
    this._pauseOnHidden = opts.pauseOnHidden !== false;
    this._onVisibilityChange = opts.onVisibilityChange || null;
    this._active = false;
    this._handleKeyDown = null;
    this._handleVisibility = null;
  }

  StatePatterns.prototype.activate = function () {
    if (this._active) return;
    this._active = true;

    var self = this;

    this._handleKeyDown = function (e) {
      if (e.key === "Escape" && typeof self._onEscape === "function") {
        e.preventDefault();
        self._onEscape();
        return;
      }
      if (e.key === "Enter" && typeof self._onEnter === "function") {
        // Don't intercept if the target is a button/input (let native behavior handle it)
        if (e.target && (e.target.tagName === "BUTTON" || e.target.tagName === "INPUT")) {
          return;
        }
        self._onEnter();
        return;
      }
      if (e.key === "Tab" && self._focusTrap) {
        self._handleFocusTrap(e);
      }
    };

    this._handleVisibility = function () {
      if (document.hidden && typeof self._onVisibilityChange === "function") {
        self._onVisibilityChange("hidden");
      } else if (!document.hidden && typeof self._onVisibilityChange === "function") {
        self._onVisibilityChange("visible");
      }
    };

    document.addEventListener("keydown", this._handleKeyDown);
    if (this._pauseOnHidden) {
      document.addEventListener("visibilitychange", this._handleVisibility);
    }
  };

  StatePatterns.prototype.deactivate = function () {
    if (!this._active) return;
    this._active = false;

    if (this._handleKeyDown) {
      document.removeEventListener("keydown", this._handleKeyDown);
      this._handleKeyDown = null;
    }
    if (this._handleVisibility) {
      document.removeEventListener("visibilitychange", this._handleVisibility);
      this._handleVisibility = null;
    }
  };

  StatePatterns.prototype._handleFocusTrap = function (e) {
    var focusable = this._container.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    if (focusable.length === 0) return;

    var first = focusable[0];
    var last = focusable[focusable.length - 1];

    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  StatePatterns.prototype.isActive = function () {
    return this._active;
  };

  StatePatterns.prototype.destroy = function () {
    this.deactivate();
    this._container = null;
    this._onEscape = null;
    this._onEnter = null;
    this._onVisibilityChange = null;
  };

  if (typeof window.feedBackMinigamesStatePatterns === "undefined") {
    window.feedBackMinigamesStatePatterns = {};
  }
  window.feedBackMinigamesStatePatterns.StatePatterns = StatePatterns;
})();