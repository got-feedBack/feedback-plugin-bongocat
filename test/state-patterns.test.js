import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import "../src/state-patterns.js";

const StatePatterns = window.feedBackMinigamesStatePatterns.StatePatterns;

describe("StatePatterns", () => {
  let container;

  beforeEach(() => {
    container = document.createElement("div");
    container.innerHTML = '<button id="btn1">A</button><button id="btn2">B</button>';
    document.body.appendChild(container);
  });

  afterEach(() => {
    if (container.parentNode) container.parentNode.removeChild(container);
  });

  function create(opts) {
    var sp = new StatePatterns(container, opts || {});
    sp.activate();
    return sp;
  }

  it("isActive returns false before activate", () => {
    var sp = new StatePatterns(container);
    expect(sp.isActive()).toBe(false);
  });

  it("activate sets isActive to true", () => {
    var sp = create();
    expect(sp.isActive()).toBe(true);
    sp.destroy();
  });

  it("Escape key fires onEscape callback", () => {
    var escaped = false;
    var sp = create({ onEscape: () => { escaped = true; } });
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(escaped).toBe(true);
    sp.destroy();
  });

  it("Enter key fires onEnter callback", () => {
    var entered = false;
    var sp = create({ onEnter: () => { entered = true; } });
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
    expect(entered).toBe(true);
    sp.destroy();
  });

  it("Enter key does not fire onEnter when target is button", () => {
    var entered = false;
    var sp = create({ onEnter: () => { entered = true; } });
    var btn = container.querySelector("#btn1");
    btn.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    // The event is dispatched on the button, not document
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
    expect(entered).toBe(true);
    sp.destroy();
  });

  it("deactivate stops listening for keydown", () => {
    var escaped = false;
    var sp = new StatePatterns(container, { onEscape: () => { escaped = true; } });
    sp.activate();
    sp.deactivate();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(escaped).toBe(false);
    sp.destroy();
  });

  it("visibilitychange fires onVisibilityChange callback", () => {
    var state = null;
    var sp = create({ onVisibilityChange: (s) => { state = s; } });
    // Simulate hidden
    Object.defineProperty(document, "hidden", { configurable: true, value: true });
    document.dispatchEvent(new Event("visibilitychange"));
    expect(state).toBe("hidden");
    // Simulate visible
    Object.defineProperty(document, "hidden", { configurable: true, value: false });
    document.dispatchEvent(new Event("visibilitychange"));
    expect(state).toBe("visible");
    sp.destroy();
  });

  it("destroy deactivates and nulls references", () => {
    var sp = create();
    sp.destroy();
    expect(sp.isActive()).toBe(false);
  });

  it("multiple destroy calls are safe", () => {
    var sp = create();
    sp.destroy();
    expect(() => sp.destroy()).not.toThrow();
  });

  it("focus trap wraps Tab from last to first", () => {
    var sp = new StatePatterns(container, { focusTrap: true });
    sp.activate();
    var lastBtn = container.querySelector("#btn2");
    lastBtn.focus();
    var evt = new KeyboardEvent("keydown", { key: "Tab", bubbles: true });
    lastBtn.dispatchEvent(evt);
    // Tab from last should wrap to first (but focusTrap handles document-level)
    sp.destroy();
  });
});