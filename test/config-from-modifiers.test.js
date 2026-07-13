import { describe, it, expect, beforeAll } from "vitest";

// Loads the real game.js IIFE (jsdom does not fetch the src/ script tags it
// appends, so only the top-level definitions run) and exercises the actual
// configFromModifiers via the test hook it exposes.
describe("configFromModifiers — instrument normalization", () => {
  let configFromModifiers;

  beforeAll(async () => {
    await import("../game.js");
    configFromModifiers = window.feedBackMinigamesBongoCatTest.configFromModifiers;
  });

  it('normalizes the "guitar/bass" modifier value to the internal "guitar" id', () => {
    expect(configFromModifiers({ instrument: "guitar/bass" }).instrument).toBe("guitar");
  });

  it('passes "piano" and "drums" through unchanged', () => {
    expect(configFromModifiers({ instrument: "piano" }).instrument).toBe("piano");
    expect(configFromModifiers({ instrument: "drums" }).instrument).toBe("drums");
  });

  it('defaults to "guitar" when the instrument is omitted', () => {
    expect(configFromModifiers({}).instrument).toBe("guitar");
    expect(configFromModifiers(undefined).instrument).toBe("guitar");
  });

  it("keeps the rest of the config intact alongside the normalization", () => {
    const config = configFromModifiers({
      instrument: "guitar/bass",
      mode: "challenge",
      tempo: "120",
      calibration: "off",
    });
    expect(config).toEqual({
      instrument: "guitar",
      mode: "challenge",
      bpm: 120,
      calibration: "off",
    });
  });
});
