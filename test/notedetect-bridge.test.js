import { describe, it, expect, beforeEach, afterEach } from "vitest";
import "../src/notedetect-bridge.js";

const NoteDetectBridge = window.feedBackMinigamesNoteDetect.NoteDetectBridge;
const parseVersion = window.feedBackMinigamesNoteDetect.parseVersion;
const gte = window.feedBackMinigamesNoteDetect.gte;

describe("NoteDetectBridge — version helpers", () => {
  it("parseVersion parses three-part version strings", () => {
    expect(parseVersion("1.10.0")).toEqual([1, 10, 0]);
    expect(parseVersion("2.0.0")).toEqual([2, 0, 0]);
    expect(parseVersion("1.9.9")).toEqual([1, 9, 9]);
  });

  it("parseVersion handles short and non-string input", () => {
    expect(parseVersion("1.10")).toEqual([1, 10, 0]);
    expect(parseVersion("1")).toEqual([1, 0, 0]);
    expect(parseVersion(undefined)).toEqual([0, 0, 0]);
    expect(parseVersion(null)).toEqual([0, 0, 0]);
  });

  it("gte returns true when a >= b", () => {
    expect(gte([1, 10, 0], [1, 10, 0])).toBe(true);
    expect(gte([2, 0, 0], [1, 10, 0])).toBe(true);
    expect(gte([1, 11, 0], [1, 10, 0])).toBe(true);
    expect(gte([1, 10, 1], [1, 10, 0])).toBe(true);
  });

  it("gte returns false when a < b", () => {
    expect(gte([1, 9, 9], [1, 10, 0])).toBe(false);
    expect(gte([0, 9, 0], [1, 0, 0])).toBe(false);
  });
});

describe("NoteDetectBridge — lifecycle", () => {
  let bridge;
  let originalNoteDetect;

  beforeEach(() => {
    originalNoteDetect = window.noteDetect;
    window.noteDetect = undefined;
    bridge = new NoteDetectBridge();
  });

  afterEach(() => {
    if (bridge) bridge.destroy();
    window.noteDetect = originalNoteDetect;
  });

  it("isAvailable returns false when notedetect absent", () => {
    bridge.init();
    expect(bridge.isAvailable()).toBe(false);
  });

  it("isAvailable returns false when version < 1.10.0", () => {
    window.noteDetect = { version: "1.9.9", highway: "test" };
    bridge.init();
    expect(bridge.isAvailable()).toBe(false);
  });

  it("isAvailable returns true when version >= 1.10.0", () => {
    window.noteDetect = { version: "1.10.0", highway: "test" };
    bridge.init();
    expect(bridge.isAvailable()).toBe(true);
  });

  it("isAvailable returns true for version 2.0.0", () => {
    window.noteDetect = { version: "2.0.0", highway: "test" };
    bridge.init();
    expect(bridge.isAvailable()).toBe(true);
  });

  it("isAvailable returns true when versionless but contained-playback API present", () => {
    // Mirrors the real notedetect plugin: no version property on the
    // instance, capability-shaped API instead.
    window.noteDetect = { setContainedChart: function () {}, highway: "test" };
    bridge.init();
    expect(bridge.isAvailable()).toBe(true);
    expect(bridge.getVersion()).toBe("unknown");
  });

  it("isAvailable returns false when versionless and contained-playback API absent", () => {
    window.noteDetect = { highway: "test" };
    bridge.init();
    expect(bridge.isAvailable()).toBe(false);
  });

  it("applyContainment saves and clears highway reference", () => {
    window.noteDetect = { version: "1.10.0", highway: "original-highway" };
    bridge.init();
    bridge.applyContainment();
    expect(window.noteDetect.highway).toBeNull();
  });

  it("restore restores original highway reference", () => {
    window.noteDetect = { version: "1.10.0", highway: "original-highway" };
    bridge.init();
    bridge.applyContainment();
    expect(window.noteDetect.highway).toBeNull();
    bridge.restore();
    expect(window.noteDetect.highway).toBe("original-highway");
  });

  it("restore is idempotent — calling twice does not throw", () => {
    window.noteDetect = { version: "1.10.0", highway: "test" };
    bridge.init();
    bridge.applyContainment();
    bridge.restore();
    expect(() => bridge.restore()).not.toThrow();
  });

  it("destroy calls restore", () => {
    window.noteDetect = { version: "1.10.0", highway: "test" };
    bridge.init();
    bridge.applyContainment();
    bridge.destroy();
    expect(window.noteDetect.highway).toBe("test");
  });

  it("getVersion returns the detected version", () => {
    window.noteDetect = { version: "1.10.0" };
    bridge.init();
    expect(bridge.getVersion()).toBe("1.10.0");
  });

  it("getVersion returns null when not detected", () => {
    bridge.init();
    expect(bridge.getVersion()).toBeNull();
  });
});

describe("NoteDetectBridge — contained playback API", () => {
  let bridge;

  beforeEach(() => {
    bridge = new NoteDetectBridge();
  });

  afterEach(() => {
    bridge.destroy();
  });

  it("getContainedPlaybackAPI returns null when not available", () => {
    bridge.init();
    expect(bridge.getContainedPlaybackAPI()).toBeNull();
  });

  it("getContainedPlaybackAPI returns API object when notedetect available", () => {
    window.noteDetect = {
      version: "1.10.0",
      setContainedChart: function () {},
      pushContainedPlayhead: function () {},
      drainContainedVerdicts: function () {},
      releaseContainedChart: function () {},
    };
    bridge.init();
    const api = bridge.getContainedPlaybackAPI();
    expect(api).not.toBeNull();
    expect(typeof api.setContainedChart).toBe("function");
    expect(typeof api.pushContainedPlayhead).toBe("function");
    expect(typeof api.drainContainedVerdicts).toBe("function");
    expect(typeof api.releaseContainedChart).toBe("function");
  });
});