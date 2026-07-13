(function () {
  "use strict";

  var PLUGIN_ID = "feedback-plugin-bongocat";
  var SRC_BASE = "/api/plugins/" + PLUGIN_ID + "/src/";
  var bridge = null;

  // All src/ modules are IIFEs that attach window.feedBackMinigames* globals
  // and never call each other at load time, so load order doesn't matter.
  // Run setup and calibration are NOT plugin concerns: run settings come in
  // via the SDK modifier picker (opts.modifiers), and latency calibration is
  // owned by the host/notedetect. InputAdapter still honours a stored
  // calibration offset when one exists, and defaults to 0 otherwise.
  var SRC_FILES = [
    "diagnostics.js",
    "design-system.js",
    "tunables.js",
    "beat-clock.js",
    "fsm.js",
    "state-context.js",
    "state-patterns.js",
    "scoring.js",
    "judge.js",
    "pattern-generator.js",
    "input-adapter.js",
    "input-gate.js",
    "notedetect-bridge.js",
    "segmented-control.js",
    "cat-expressions.js",
    "cat-demo.js",
    "bpm-motion.js",
    "notation-strip.js",
    "hud.js",
    "hub-tile.js",
    "run-summary.js",
    "run-history.js",
    "run-controller.js",
  ];

  function loadScript(file) {
    return new Promise(function (resolve, reject) {
      var s = document.createElement("script");
      s.src = SRC_BASE + file;
      s.onload = resolve;
      s.onerror = function () { reject(new Error("failed to load " + file)); };
      document.head.appendChild(s);
    });
  }

  // Normalize the SDK modifier selection (all values arrive as strings)
  // into the run config the game components consume.
  function configFromModifiers(modifiers) {
    modifiers = modifiers || {};
    var bpm = parseInt(modifiers.tempo, 10);
    // "guitar/bass" is the user-facing modifier value; internally both are
    // handled by the guitar (notedetect) input path.
    var instrument = modifiers.instrument === "guitar/bass" ? "guitar" : modifiers.instrument;
    return {
      instrument: instrument || "guitar",
      mode: modifiers.mode || "learning",
      bpm: isNaN(bpm) ? 80 : bpm,
      calibration: modifiers.calibration || "auto",
    };
  }

  // Exposed for tests only — not part of the SDK surface.
  window.feedBackMinigamesBongoCatTest = { configFromModifiers: configFromModifiers };

  var controller = null;

  function startRun(container, config, sdk) {
    var stage = container.querySelector('[data-surface="game"]');
    if (!stage) return;
    controller = new window.feedBackMinigamesRunController.RunController(stage, {
      config: config,
      sdk: sdk,
      noteDetectBridge: bridge,
    });
    controller.start();
  }

  var spec = {
    id: PLUGIN_ID,
    title: "Bongo Cat's Rhythm Trainer",
    tagline: "Tap along with Bongo Cat — match the beat, earn your stripes.",
    thumbnail: "thumbnail.png",
    // Mirrored in plugin.json's minigame block; the manifest copy takes
    // precedence in the host's modifier picker.
    modifiers: [
      { id: "instrument", label: "Instrument", default: "guitar/bass", values: ["guitar/bass", "piano", "drums"] },
      { id: "mode", label: "Mode", default: "learning", values: ["learning", "challenge"] },
      { id: "tempo", label: "Tempo (BPM)", default: "80", values: ["60", "80", "100", "120", "140", "160"] },
      { id: "calibration", label: "Calibration", default: "auto", values: ["auto", "on", "off"] },
    ],

    start: function start(opts) {
      var container = opts.container;
      var sdk = opts.sdk;
      var config = configFromModifiers(opts.modifiers);

      container.innerHTML =
        '<div class="bc-game-root">' +
          '<div class="bc-game-root__surface" data-surface="game"></div>' +
        '</div>';

      // Initialize notedetect bridge on game entry (guitar input only).
      bridge = new window.feedBackMinigamesNoteDetect.NoteDetectBridge();
      bridge.init();
      bridge.applyContainment();

      // Guitar needs notedetect; fall back to piano when it's unavailable.
      if (config.instrument === "guitar" && !bridge.isAvailable()) {
        console.warn("BongoCat: guitar input unavailable — falling back to piano.");
        config.instrument = "piano";
      }

      startRun(container, config, sdk);
    },

    stop: function stop() {
      if (controller) {
        controller.destroy();
        controller = null;
      }
      // Restore notedetect on exit
      if (bridge) {
        bridge.restore();
      }
      var root = document.querySelector(".bc-game-root");
      if (root) {
        root.parentNode.removeChild(root);
      }
    }
  };

  // Register with the minigames SDK (queue if not ready). Mirrors the
  // reference plugins: register exactly once — directly, or via the
  // pending queue the host drains on init.
  function postSpec() {
    var mg = window.feedBackMinigames;
    if (mg && mg.register) {
      mg.register(spec);
    } else {
      (window.__feedBackMinigamesPending = window.__feedBackMinigamesPending || []).push(spec);
    }
  }

  // Load the src/ module graph first so start() can rely on the globals,
  // then register. The hub tile shows "Loading…" until registration lands.
  Promise.all(SRC_FILES.map(loadScript)).then(postSpec, function (err) {
    console.error("[" + PLUGIN_ID + "] failed to load src modules:", err);
  });
})();
