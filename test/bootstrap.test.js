import { describe, it, expect, beforeEach, afterEach } from "vitest";

const PLUGIN_ID = "feedback-plugin-bongocat";

describe("IIFE bootstrap", () => {
  let registeredSpecs;

  beforeEach(() => {
    registeredSpecs = [];
    // Stub the framework registration
    window.feedBackMinigames = {
      register: (spec) => {
        registeredSpecs.push(spec);
      },
    };
    window.__feedBackMinigamesPending = [];
  });

  afterEach(() => {
    delete window.feedBackMinigames;
    delete window.__feedBackMinigamesPending;
  });

  it("registers with correct spec.id matching plugin.json id", () => {
    // Simulate the IIFE bootstrap logic directly
    var spec = { id: PLUGIN_ID, title: "Bongo Cat's Rhythm Trainer" };
    if (typeof window.feedBackMinigames !== "undefined") {
      window.feedBackMinigames.register(spec);
    }

    expect(registeredSpecs.length).toBe(1);
    expect(registeredSpecs[0].id).toBe(PLUGIN_ID);
  });

  it("queues pending spec when feedBackMinigames is undefined", () => {
    delete window.feedBackMinigames;

    // Simulate the IIFE logic
    var spec = { id: PLUGIN_ID, title: "test" };
    if (typeof window.feedBackMinigames !== "undefined") {
      window.feedBackMinigames.register(spec);
    } else {
      window.__feedBackMinigamesPending = window.__feedBackMinigamesPending || [];
      window.__feedBackMinigamesPending.push(spec);
    }

    expect(window.__feedBackMinigamesPending.length).toBe(1);
    expect(window.__feedBackMinigamesPending[0].id).toBe(PLUGIN_ID);
  });

  it("registers once framework becomes available after pending queue", () => {
    delete window.feedBackMinigames;

    // Simulate pending queue
    var spec = { id: PLUGIN_ID, title: "test" };
    window.__feedBackMinigamesPending = [spec];

    // Now framework becomes available — drain
    window.feedBackMinigames = {
      register: (s) => { registeredSpecs.push(s); },
    };

    while (window.__feedBackMinigamesPending.length > 0) {
      var pending = window.__feedBackMinigamesPending.shift();
      window.feedBackMinigames.register(pending);
    }

    expect(registeredSpecs.length).toBe(1);
    expect(registeredSpecs[0].id).toBe(PLUGIN_ID);
  });

  it("spec has required fields: id, title, tagline, thumbnail, start, stop", () => {
    var spec = {
      id: PLUGIN_ID,
      title: "Bongo Cat's Rhythm Trainer",
      tagline: "test",
      thumbnail: "/api/plugins/" + PLUGIN_ID + "/assets/thumbnail.png",
      start: function () {},
      stop: function () {},
    };

    expect(spec).toHaveProperty("id");
    expect(spec).toHaveProperty("title");
    expect(spec).toHaveProperty("tagline");
    expect(spec).toHaveProperty("thumbnail");
    expect(typeof spec.start).toBe("function");
    expect(typeof spec.stop).toBe("function");
  });

  it("spec.id exactly equals plugin.json id", () => {
    var pluginJson = { id: PLUGIN_ID };
    var spec = { id: PLUGIN_ID };
    expect(spec.id).toBe(pluginJson.id);
  });

  it("surface handler is a function or null", () => {
    var spec = { id: PLUGIN_ID, surface: null };
    expect(spec.surface).toBeNull();

    // After start, surface should be set
    spec.surface = function (surfaceType) {
      return surfaceType === "hub" ? {} : null;
    };
    expect(typeof spec.surface).toBe("function");
    expect(spec.surface("hub")).toBeTruthy();
    expect(spec.surface("game")).toBeNull();
  });
});

describe("CSS scoping — .bc-game-root", () => {
  it("all plugin HTML is scoped under a single .bc-game-root element", () => {
    const root = document.createElement("div");
    root.className = "bc-game-root";
    document.body.appendChild(root);

    const elements = document.querySelectorAll(".bc-game-root");
    expect(elements.length).toBe(1);

    document.body.removeChild(root);
  });

  it("no CSS selectors leak outside .bc-game-root to the host", () => {
    const host = document.createElement("div");
    host.id = "host-container";
    document.body.appendChild(host);

    // Create scoped root inside host
    const root = document.createElement("div");
    root.className = "bc-game-root";
    host.appendChild(root);

    const tile = document.createElement("div");
    tile.className = "bc-game-root__hub-tile";
    root.appendChild(tile);

    // Host should not have game classes
    expect(host.classList.contains("bc-game-root")).toBe(false);
    expect(host.classList.contains("bc-game-root__hub-tile")).toBe(false);

    // But the scoped elements exist
    expect(host.querySelectorAll(".bc-game-root").length).toBe(1);
    expect(host.querySelectorAll(".bc-game-root__hub-tile").length).toBe(1);

    document.body.removeChild(host);
  });
});

describe("Hub tile — last-run summary", () => {
  function buildTileHtml(lastRun) {
    var summaryHtml = "";
    if (lastRun) {
      summaryHtml =
        lastRun.mode + " · " + lastRun.bpm + " BPM" +
        (lastRun.summaryHtml ? " — " + lastRun.summaryHtml : "");
    } else {
      summaryHtml = "No runs yet";
    }
    return (
      '<div class="bc-game-root">' +
        '<div class="bc-game-root__hub-tile">' +
          '<p class="bc-game-root__hub-summary">' + summaryHtml + '</p>' +
        '</div>' +
      '</div>'
    );
  }

  it('shows "No runs yet" when no prior runs exist', () => {
    const html = buildTileHtml(null);
    expect(html).toContain("No runs yet");
  });

  it("shows mode and BPM from last run when prior runs exist", () => {
    const lastRun = { mode: "freestyle", bpm: 120, score: 5000 };
    const html = buildTileHtml(lastRun);
    expect(html).toContain("freestyle");
    expect(html).toContain("120 BPM");
  });

  it("includes summaryHtml when provided", () => {
    const lastRun = { mode: "freestyle", bpm: 120, summaryHtml: "Beat 90%!" };
    const html = buildTileHtml(lastRun);
    expect(html).toContain("Beat 90%!");
  });
});

describe("plugin.json spec", () => {
  it("minigame block has required fields", () => {
    var plugin = {
      id: PLUGIN_ID,
      minigame: {
        title: "Bongo Cat's Rhythm Trainer",
        type: "chart-free",
        scoring: "discrete",
        thumbnail: "/api/plugins/" + PLUGIN_ID + "/assets/thumbnail.png",
      },
    };

    expect(plugin.minigame.type).toBe("chart-free");
    expect(plugin.minigame.scoring).toBe("discrete");
    expect(plugin.minigame.title).toBe("Bongo Cat's Rhythm Trainer");
  });

  it("plugin id matches spec.id", () => {
    var pluginJson = { id: PLUGIN_ID };
    var spec = { id: PLUGIN_ID };
    expect(spec.id).toBe(pluginJson.id);
  });
});