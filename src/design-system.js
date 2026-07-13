(function () {
  "use strict";

  /* ============================================================
     Sticker Arcade Design System — Visual Language (E5S1)
     ============================================================ */

  var themeOverride = null;
  var themeChangeListeners = [];

  // --- Theme detection ---

  function getPreferredTheme() {
    if (themeOverride) return themeOverride;
    if (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches) {
      return "dark";
    }
    return "light";
  }

  function getDarkModeMediaQuery() {
    if (typeof window.matchMedia !== "function") return null;
    return window.matchMedia("(prefers-color-scheme: dark)");
  }

  function onThemeChange(callback) {
    if (typeof callback !== "function") return;
    themeChangeListeners.push(callback);
    var mq = getDarkModeMediaQuery();
    if (mq && typeof mq.addEventListener === "function") {
      mq.addEventListener("change", callback);
    }
  }

  function notifyThemeChange(newTheme) {
    for (var i = 0; i < themeChangeListeners.length; i++) {
      try {
        themeChangeListeners[i](newTheme);
      } catch (_) { /* swallow */ }
    }
  }

  // --- Theme override (manual toggle) ---

  function setTheme(theme) {
    if (theme !== "light" && theme !== "dark") return;
    themeOverride = theme;
    notifyThemeChange(getPreferredTheme());
  }

  function resetTheme() {
    themeOverride = null;
    notifyThemeChange(getPreferredTheme());
  }

  function getTheme() {
    return getPreferredTheme();
  }

  // --- Apply theme data attribute on container ---

  function applyTheme(container, theme) {
    if (!container) return;
    theme = theme || getPreferredTheme();
    container.dataset.bcTheme = theme;
  }

  // --- Initialize design system on a container ---

  function init(container) {
    if (!container) return;
    container.classList.add("bc-game-root");
    applyTheme(container);

    // Listen for OS-level theme changes
    onThemeChange(function () {
      applyTheme(container);
    });
  }

  // --- Element creation utilities ---

  function createStickerPanel(options) {
    options = options || {};
    var el = document.createElement("div");
    el.className = "bc-sticker-panel";

    if (options.className) {
      el.className += " " + options.className;
    }

    if (options.rotation != null) {
      el.style.setProperty("--bc-panel-rotation", options.rotation + "deg");
    }

    if (options.id) {
      el.id = options.id;
    }

    if (options.content) {
      if (typeof options.content === "string") {
        el.innerHTML = options.content;
      } else if (options.content instanceof HTMLElement) {
        el.appendChild(options.content);
      }
    }

    if (options.dataset) {
      for (var key in options.dataset) {
        if (Object.prototype.hasOwnProperty.call(options.dataset, key)) {
          el.dataset[key] = options.dataset[key];
        }
      }
    }

    return el;
  }

  function createButton(options) {
    options = options || {};
    var el = document.createElement("button");
    el.className = "bc-btn";

    if (options.variant === "primary") {
      el.className += " bc-btn--primary";
    } else if (options.variant === "secondary") {
      el.className += " bc-btn--secondary";
    } else {
      el.className += " bc-btn--ghost";
    }

    if (options.className) {
      el.className += " " + options.className;
    }

    if (options.label) {
      el.textContent = options.label;
    }

    if (options.disabled) {
      el.disabled = true;
      el.className += " bc-btn--disabled";
    }

    if (options.title) {
      el.title = options.title;
    }

    if (options.onClick) {
      el.addEventListener("click", options.onClick);
    }

    if (options.type) {
      el.type = options.type;
    }

    if (options.dataset) {
      for (var key in options.dataset) {
        if (Object.prototype.hasOwnProperty.call(options.dataset, key)) {
          el.dataset[key] = options.dataset[key];
        }
      }
    }

    return el;
  }

  function createSegmentedControl(options) {
    options = options || {};
    var segments = options.segments || [];
    var activeIndex = options.activeIndex || 0;
    var onChange = options.onChange || null;

    var container = document.createElement("div");
    container.className = "bc-segmented";

    if (options.className) {
      container.className += " " + options.className;
    }

    if (options.id) {
      container.id = options.id;
    }

    var buttons = [];
    var activeBtn = null;

    for (var i = 0; i < segments.length; i++) {
      var seg = segments[i];
      var btn = document.createElement("button");
      btn.className = "bc-segmented-btn";
      btn.textContent = seg.label || "";

      if (seg.value) {
        btn.dataset.value = seg.value;
      }

      if (seg.disabled) {
        btn.disabled = true;
        btn.className += " bc-segmented-btn--disabled";
      }

      if (i === activeIndex && !seg.disabled) {
        btn.className += " bc-segmented-btn--active";
        activeBtn = btn;
      }

      (function (idx, button) {
        button.addEventListener("click", function () {
          if (button.disabled) return;
          // Deactivate all
          for (var j = 0; j < buttons.length; j++) {
            buttons[j].classList.remove("bc-segmented-btn--active");
          }
          // Activate clicked
          button.classList.add("bc-segmented-btn--active");
          if (onChange) {
            onChange(idx, seg.value || seg.label, button);
          }
        });
      })(i, btn);

      buttons.push(btn);
      container.appendChild(btn);
    }

    return container;
  }

  // --- Public API ---
  var DesignSystem = {
    init: init,
    getTheme: getTheme,
    setTheme: setTheme,
    resetTheme: resetTheme,
    applyTheme: applyTheme,
    getPreferredTheme: getPreferredTheme,
    onThemeChange: onThemeChange,
    createStickerPanel: createStickerPanel,
    createButton: createButton,
    createSegmentedControl: createSegmentedControl,
  };

  // Expose globally (IIFE convention per project pattern)
  if (typeof window.feedBackMinigamesDesignSystem === "undefined") {
    window.feedBackMinigamesDesignSystem = DesignSystem;
  }
})();