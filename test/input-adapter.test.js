import { describe, it, expect, beforeEach, afterEach } from "vitest";
import "../src/tunables.js";
import "../src/input-adapter.js";

const InputAdapter = window.feedBackMinigamesInputAdapter.InputAdapter;
const T = window.feedBackMinigamesTunables.T;

describe("InputAdapter — construction", () => {
  it("constructs with default instrument=guitar", () => {
    const adapter = new InputAdapter();
    expect(adapter).toBeTruthy();
    expect(adapter._instrument).toBe("guitar");
  });

  it("constructs with specified instrument", () => {
    const adapter = new InputAdapter({ instrument: "piano" });
    expect(adapter._instrument).toBe("piano");
  });

  it("constructs with drums instrument", () => {
    const adapter = new InputAdapter({ instrument: "drums" });
    expect(adapter._instrument).toBe("drums");
  });

  it("stores onOnset callback", () => {
    const fn = () => {};
    const adapter = new InputAdapter({ onOnset: fn });
    expect(adapter._onOnset).toBe(fn);
  });

  it("loads calibration offset from localStorage for guitar", () => {
    localStorage.setItem("bongocat.calibration.mic-default", "42");
    const adapter = new InputAdapter({ instrument: "guitar" });
    expect(adapter.getCalibrationOffset()).toBe(42);
    localStorage.removeItem("bongocat.calibration.mic-default");
  });

  it("starts with offset 0 when localStorage is empty", () => {
    localStorage.removeItem("bongocat.calibration.mic-default");
    const adapter = new InputAdapter({ instrument: "guitar" });
    expect(adapter.getCalibrationOffset()).toBe(0);
  });

  it("starts with offset 0 for MIDI instruments", () => {
    localStorage.setItem("bongocat.calibration.mic-default", "42");
    const adapter = new InputAdapter({ instrument: "piano" });
    expect(adapter.getCalibrationOffset()).toBe(0);
    localStorage.removeItem("bongocat.calibration.mic-default");
  });

  it("uses DOUBLE_TRIGGER_WINDOW_MS from tunables", () => {
    const adapter = new InputAdapter();
    expect(adapter._debounceWindowMs).toBe(T.DOUBLE_TRIGGER_WINDOW_MS);
  });
});

describe("InputAdapter — setInstrument and calibration", () => {
  beforeEach(() => {
    localStorage.setItem("bongocat.calibration.mic-default", "33");
  });

  afterEach(() => {
    localStorage.removeItem("bongocat.calibration.mic-default");
  });

  it("setInstrument loads calibration for guitar", () => {
    const adapter = new InputAdapter({ instrument: "piano" });
    expect(adapter.getCalibrationOffset()).toBe(0);
    adapter.setInstrument("guitar");
    expect(adapter.getCalibrationOffset()).toBe(33);
  });

  it("setInstrument to MIDI resets offset to 0", () => {
    const adapter = new InputAdapter({ instrument: "guitar" });
    adapter.setInstrument("piano");
    expect(adapter.getCalibrationOffset()).toBe(0);
  });
});

describe("InputAdapter — handleRawOnset", () => {
  let adapter;
  let onsets;

  beforeEach(() => {
    onsets = [];
    adapter = new InputAdapter({
      instrument: "guitar",
      onOnset: (o) => onsets.push(o),
    });
    adapter._beatClock = {
      isRunning: () => true,
      beatTime: () => 3.5,
    };
  });

  it("forwards onset when instrument matches", () => {
    const result = adapter.handleRawOnset("guitar", 1000);
    expect(result).not.toBeNull();
    expect(result.sourceInstrument).toBe("guitar");
    expect(result.timestamp).toBeTypeOf("number");
    expect(result.beatTime).toBeTypeOf("number");
  });

  it("drops onset when instrument does not match", () => {
    const result = adapter.handleRawOnset("piano", 1000);
    expect(result).toBeNull();
    expect(onsets.length).toBe(0);
  });

  it("drops onset from drums when guitar selected", () => {
    const result = adapter.handleRawOnset("drums", 1000);
    expect(result).toBeNull();
  });

  it("debounces duplicate onsets within window", () => {
    adapter.handleRawOnset("guitar", 1000);
    expect(onsets.length).toBe(1);

    const result = adapter.handleRawOnset("guitar", 1020);
    expect(result).toBeNull();
    expect(onsets.length).toBe(1);
  });

  it("allows onset after debounce window passes", () => {
    adapter.handleRawOnset("guitar", 1000);
    expect(onsets.length).toBe(1);

    const farLater = 1000 + T.DOUBLE_TRIGGER_WINDOW_MS + 10;
    const result = adapter.handleRawOnset("guitar", farLater);
    expect(result).not.toBeNull();
    expect(onsets.length).toBe(2);
  });

  it("applies calibration offset for guitar", () => {
    adapter._calibrationOffset = 50;
    adapter.handleRawOnset("guitar", 1000);

    expect(onsets.length).toBe(1);
    // timestamp should be adjusted by calibration offset
    expect(onsets[0].timestamp).toBeLessThan(1000);
  });

  it("debounce uses configurable window", () => {
    adapter.setDebounceWindow(200);
    adapter.handleRawOnset("guitar", 1000);
    expect(onsets.length).toBe(1);

    // Still within 200ms window
    const result = adapter.handleRawOnset("guitar", 1150);
    expect(result).toBeNull();
    expect(onsets.length).toBe(1);
  });
});

describe("InputAdapter — handleRawOnset (MIDI)", () => {
  let adapter;
  let onsets;

  beforeEach(() => {
    onsets = [];
    adapter = new InputAdapter({
      instrument: "piano",
      onOnset: (o) => onsets.push(o),
    });
    adapter._beatClock = {
      isRunning: () => true,
      beatTime: () => 2.0,
    };
  });

  it("forwards MIDI onset when instrument matches", () => {
    const result = adapter.handleRawOnset("piano", 2000);
    expect(result).not.toBeNull();
    expect(result.sourceInstrument).toBe("piano");
  });

  it("drops MIDI onset when guitar is selected", () => {
    adapter.setInstrument("guitar");
    const result = adapter.handleRawOnset("piano", 2000);
    expect(result).toBeNull();
  });
});

describe("InputAdapter — injectOnset", () => {
  let adapter;
  let onsets;

  beforeEach(() => {
    onsets = [];
    adapter = new InputAdapter({
      instrument: "guitar",
      onOnset: (o) => onsets.push(o),
    });
  });

  it("injects onset with explicit beatTime bypassing debounce", () => {
    const result = adapter.injectOnset("guitar", 1.5, 1000);
    expect(result).not.toBeNull();
    expect(result.sourceInstrument).toBe("guitar");
    expect(result.beatTime).toBe(1.5);
    expect(result.timestamp).toBe(1000);
    expect(onsets.length).toBe(1);
  });

  it("rejects injectOnset from non-selected instrument", () => {
    const result = adapter.injectOnset("piano", 1.5, 1000);
    expect(result).toBeNull();
    expect(onsets.length).toBe(0);
  });
});

describe("InputAdapter — deriveMiniChart", () => {
  let adapter;

  beforeEach(() => {
    adapter = new InputAdapter({ instrument: "guitar", bpm: 120 });
  });

  it("returns empty onsets array for null pattern", () => {
    const chart = adapter.deriveMiniChart(null);
    expect(chart.onsets).toEqual([]);
  });

  it("returns empty onsets array for pattern with no expectedOnsets", () => {
    const chart = adapter.deriveMiniChart({ expectedOnsets: [] });
    expect(chart.onsets).toEqual([]);
  });

  it("creates mini-chart onsets from pattern expectedOnsets", () => {
    const pattern = {
      expectedOnsets: [0, 1, 2, 3],
    };
    const chart = adapter.deriveMiniChart(pattern);
    expect(chart.onsets.length).toBe(4);
  });

  it("each mini-chart onset has beatTime, hitWindowStart, hitWindowEnd", () => {
    const pattern = { expectedOnsets: [1.0] };
    const chart = adapter.deriveMiniChart(pattern);

    expect(chart.onsets[0].beatTime).toBe(1.0);
    expect(chart.onsets[0].hitWindowStart).toBeTypeOf("number");
    expect(chart.onsets[0].hitWindowStart).toBeLessThan(1.0);
    expect(chart.onsets[0].hitWindowEnd).toBeTypeOf("number");
    expect(chart.onsets[0].hitWindowEnd).toBeGreaterThan(1.0);
  });

  it("uses GOOD_OUTER_MS from tunables for window width", () => {
    // At 120 BPM: 1 beat = 500ms, so GOOD_OUTER_MS(60) = 0.12 beats
    const pattern = { expectedOnsets: [0, 1] };
    const chart = adapter.deriveMiniChart(pattern);

    const expectedWindow = T.GOOD_OUTER_MS / 500; // 60ms / 500ms_per_beat
    const start = chart.onsets[0].hitWindowStart;
    expect(Math.abs(start + expectedWindow)).toBeLessThan(0.001);
  });
});

describe("InputAdapter — MIDI attach/detach", () => {
  let adapter;

  beforeEach(() => {
    adapter = new InputAdapter({ instrument: "piano" });
    // Stub requestMIDIAccess before attaching
    window.navigator.requestMIDIAccess = () =>
      Promise.resolve({
        inputs: {
          values: () => [],
        },
        onstatechange: null,
      });
  });

  it("attachMidi returns true and sets attached flag", async () => {
    const result = adapter.attachMidi();
    expect(result).toBe(true);
    // Wait for promise to resolve
    await new Promise((r) => setTimeout(r, 10));
    expect(adapter._attached).toBe(true);
  });

  it("detachMidi clears inputs", async () => {
    adapter.attachMidi();
    await new Promise((r) => setTimeout(r, 10));
    adapter.detachMidi();
    expect(adapter._midiInputs.length).toBe(0);
    expect(adapter._attached).toBe(false);
  });
});

describe("InputAdapter — beatClock integration", () => {
  it("sets beatTime via setBeatClock", () => {
    const adapter = new InputAdapter();
    const clock = { isRunning: () => true, beatTime: () => 7.5 };
    adapter.setBeatClock(clock);
    expect(adapter._beatClock).toBe(clock);
  });

  it("handleRawOnset uses beatClock beatTime", () => {
    let onsets = [];
    const adapter = new InputAdapter({
      instrument: "guitar",
      onOnset: (o) => onsets.push(o),
    });
    const clock = { isRunning: () => true, beatTime: () => 4.25 };
    adapter.setBeatClock(clock);

    adapter.handleRawOnset("guitar", 500);
    expect(onsets[0].beatTime).toBe(4.25);
  });

  it("handleRawOnset returns beatTime 0 when beatClock is not running", () => {
    let onsets = [];
    const adapter = new InputAdapter({
      instrument: "guitar",
      onOnset: (o) => onsets.push(o),
    });
    const clock = { isRunning: () => false, beatTime: () => 99 };
    adapter.setBeatClock(clock);

    adapter.handleRawOnset("guitar", 500);
    expect(onsets[0].beatTime).toBe(0);
  });

  it("handleRawOnset returns beatTime 0 when no beatClock set", () => {
    let onsets = [];
    const adapter = new InputAdapter({
      instrument: "guitar",
      onOnset: (o) => onsets.push(o),
    });

    adapter.handleRawOnset("guitar", 500);
    expect(onsets[0].beatTime).toBe(0);
  });
});