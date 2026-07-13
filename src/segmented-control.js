(function () {
  "use strict";

  function SegmentedControl(options) {
    options = options || {};
    this._name = options.name || "segmented";
    this._items = options.items || [];
    this._activeIndex = options.activeIndex || 0;
    this._onChange = options.onChange || null;
    this._disabledIndices = options.disabledIndices || [];
    this._el = null;
  }

  SegmentedControl.prototype.render = function () {
    var self = this;
    var el = document.createElement("div");
    el.className = "bc-game-root__segmented";
    el.setAttribute("role", "radiogroup");
    el.setAttribute("aria-label", this._name);

    this._items.forEach(function (item, i) {
      var btn = document.createElement("button");
      btn.className = "bc-game-root__segmented-btn";
      if (i === self._activeIndex && !self._isDisabled(i)) {
        btn.classList.add("bc-game-root__segmented-btn--active");
      }
      btn.setAttribute("role", "radio");
      btn.setAttribute("aria-checked", i === self._activeIndex ? "true" : "false");
      btn.setAttribute("tabindex", i === self._activeIndex ? "0" : "-1");
      btn.textContent = item.label;
      btn.dataset.value = item.value;

      if (self._isDisabled(i)) {
        btn.disabled = true;
        btn.classList.add("bc-game-root__segmented-btn--disabled");
        btn.setAttribute("aria-disabled", "true");
      }

      btn.addEventListener("click", function () {
        self.setActive(i);
      });

      el.appendChild(btn);
    });

    // Keyboard nav: left/right arrows
    el.addEventListener("keydown", function (e) {
      var next;
      if (e.key === "ArrowRight" || e.key === "ArrowDown") {
        e.preventDefault();
        next = (self._activeIndex + 1) % self._items.length;
        self.setActive(next);
      } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
        e.preventDefault();
        next = (self._activeIndex - 1 + self._items.length) % self._items.length;
        self.setActive(next);
      }
    });

    this._el = el;
    return el;
  };

  SegmentedControl.prototype._isDisabled = function (index) {
    return this._disabledIndices.indexOf(index) !== -1;
  };

  SegmentedControl.prototype.setActive = function (index) {
    if (index < 0 || index >= this._items.length || index === this._activeIndex) return;
    if (this._isDisabled(index)) return;
    this._activeIndex = index;

    var btns = this._el.querySelectorAll(".bc-game-root__segmented-btn");
    btns.forEach(function (btn, i) {
      if (i === index) {
        btn.classList.add("bc-game-root__segmented-btn--active");
        btn.setAttribute("aria-checked", "true");
        btn.setAttribute("tabindex", "0");
        btn.focus();
      } else {
        btn.classList.remove("bc-game-root__segmented-btn--active");
        btn.setAttribute("aria-checked", "false");
        btn.setAttribute("tabindex", "-1");
      }
    });

    if (typeof this._onChange === "function") {
      this._onChange(this._items[index], index);
    }
  };

  SegmentedControl.prototype.getValue = function () {
    return this._items[this._activeIndex].value;
  };

  SegmentedControl.prototype.getLabel = function () {
    return this._items[this._activeIndex].label;
  };

  SegmentedControl.prototype.destroy = function () {
    if (this._el && this._el.parentNode) {
      this._el.parentNode.removeChild(this._el);
    }
    this._el = null;
  };

  if (typeof window.feedBackMinigamesControls === "undefined") {
    window.feedBackMinigamesControls = {};
  }
  window.feedBackMinigamesControls.SegmentedControl = SegmentedControl;
})();