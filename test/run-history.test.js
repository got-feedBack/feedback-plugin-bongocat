import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import "../src/run-history.js";

const RunHistory = window.feedBackMinigamesRunHistory.RunHistory;

// ---------------------------------------------------------------------------
// Mock helpers
// ---------------------------------------------------------------------------

/**
 * Lightweight mock for the SDK profile API.
 * Returns a promise that resolves with the given profile.
 */
function mockSdk(profile) {
  return {
    getProfile: vi.fn().mockResolvedValue(profile || { id: "user-42" }),
  };
}

/**
 * Factory for mock XHR instances that vitest's spies can drive.
 * Returns a constructor-replacement object whose instances expose
 * `open`, `setRequestHeader`, `send`, `onload`, `onerror`, and the
 * response properties the caller needs.
 *
 * The returned constructor is also stubbed onto globalThis.XMLHttpRequest.
 * Call vi.unstubAllGlobals() in afterEach to clean up.
 */
function installMockXHR() {
  var instances = [];
  var FakeXHR = vi.fn(function () {
    this._method = null;
    this._url = null;
    this._headers = {};
    this._body = null;
    this.status = 0;
    this.responseText = "";

    this.open = vi.fn(function (method, url) {
      this._method = method;
      this._url = url;
    });
    this.setRequestHeader = vi.fn(function (k, v) {
      this._headers[k] = v;
    });
    this.send = vi.fn(function (body) {
      this._body = body;
      FakeXHR._lastInstance = this;
    });

    this.onload = null;
    this.onerror = null;

    instances.push(this);
  });

  FakeXHR._instances = instances;
  FakeXHR._lastInstance = null;

  vi.stubGlobal("XMLHttpRequest", FakeXHR);

  return FakeXHR;
}

/**
 * Wait for queued microtasks (e.g. resolved promise .then callbacks)
 * to flush before proceeding.
 */
function tick() {
  return new Promise(function (resolve) {
    setTimeout(resolve, 0);
  });
}

/**
 * Resolve user ID and trigger the XHR load callback on the last created instance.
 */
function triggerLoad(status, body) {
  var FakeXHR = /** @type {any} */ (globalThis.XMLHttpRequest);
  var xhr = FakeXHR._lastInstance;
  if (!xhr) return;
  xhr.status = status;
  xhr.responseText = body || "";
  if (typeof xhr.onload === "function") {
    xhr.onload();
  }
}

function triggerError() {
  var FakeXHR = /** @type {any} */ (globalThis.XMLHttpRequest);
  var xhr = FakeXHR._lastInstance;
  if (!xhr) return;
  if (typeof xhr.onerror === "function") {
    xhr.onerror();
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("RunHistory — namespace", () => {
  it("exposes RunHistory on window.feedBackMinigamesRunHistory", () => {
    expect(window.feedBackMinigamesRunHistory.RunHistory).toBe(RunHistory);
  });
});

describe("RunHistory — construction", () => {
  it("constructs a RunHistory instance with an SDK", () => {
    var rh = new RunHistory(mockSdk());
    expect(rh).toBeTruthy();
    expect(rh instanceof RunHistory).toBe(true);
  });

  it("throws if no SDK is given", () => {
    expect(() => new RunHistory()).toThrow();
    expect(() => new RunHistory(null)).toThrow();
  });
});

describe("RunHistory — saveRun", () => {
  var sdk;
  var rh;

  beforeEach(() => {
    installMockXHR();
    sdk = mockSdk({ id: "user-abc" });
    rh = new RunHistory(sdk);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    rh.clearCache();
  });

  it("sends a POST to /runs with correct Content-Type", async () => {
    rh.saveRun({ score: 500, mode: "challenge" });
    await tick();

    var xhr = /** @type {any} */ (globalThis.XMLHttpRequest)._lastInstance;
    expect(xhr).toBeTruthy();
    expect(xhr._method).toBe("POST");
    expect(xhr._url).toContain("/api/plugins/feedback-plugin-bongocat/runs");
    expect(xhr._headers["Content-Type"]).toBe("application/json");
  });

  it("includes the resolved user_id in the body", async () => {
    rh.saveRun({ score: 500, mode: "challenge" });
    await tick();

    var xhr = /** @type {any} */ (globalThis.XMLHttpRequest)._lastInstance;
    var body = JSON.parse(xhr._body);
    expect(body.user_id).toBe("user-abc");
    expect(body.score).toBe(500);
    expect(body.mode).toBe("challenge");
  });

  it("calls back with null on 201 response", async () => {
    return new Promise(function (resolve) {
      rh.saveRun({ score: 500 }, function (err) {
        expect(err).toBeNull();
        resolve();
      });
      tick().then(function () {
        triggerLoad(201);
      });
    });
  });

  it("calls back with an error on non-201 response", async () => {
    return new Promise(function (resolve) {
      rh.saveRun({ score: 500 }, function (err) {
        expect(err).toBeTruthy();
        expect(err.message).toContain("500");
        resolve();
      });
      tick().then(function () {
        triggerLoad(500);
      });
    });
  });

  it("calls back with an error on network failure", async () => {
    return new Promise(function (resolve) {
      rh.saveRun({ score: 500 }, function (err) {
        expect(err).toBeTruthy();
        expect(err.message).toContain("network error");
        resolve();
      });
      tick().then(function () {
        triggerError();
      });
    });
  });

  it("calls back with an error when runData is null", async () => {
    return new Promise(function (resolve) {
      rh.saveRun(null, function (err) {
        expect(err).toBeTruthy();
        expect(err.message).toContain("runData must be an object");
        resolve();
      });
    });
  });

  it("calls back with an error when runData is undefined", async () => {
    return new Promise(function (resolve) {
      rh.saveRun(undefined, function (err) {
        expect(err).toBeTruthy();
        expect(err.message).toContain("runData must be an object");
        resolve();
      });
    });
  });

  it("does not throw when callback is omitted", async () => {
    expect(function () {
      rh.saveRun({ score: 100 });
    }).not.toThrow();
  });

  it("caches the user ID after the first call", async () => {
    rh.saveRun({ score: 500 });
    await tick();
    expect(sdk.getProfile).toHaveBeenCalledTimes(1);

    // second call should not call getProfile again
    rh.saveRun({ score: 600 });
    await tick();
    expect(sdk.getProfile).toHaveBeenCalledTimes(1);
  });
});

describe("RunHistory — fetchLatest", () => {
  var sdk;
  var rh;

  beforeEach(() => {
    installMockXHR();
    sdk = mockSdk({ id: "user-abc" });
    rh = new RunHistory(sdk);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    rh.clearCache();
  });

  it("sends a GET to /runs/latest with user_id query param", async () => {
    rh.fetchLatest();
    await tick();

    var xhr = /** @type {any} */ (globalThis.XMLHttpRequest)._lastInstance;
    expect(xhr).toBeTruthy();
    expect(xhr._method).toBe("GET");
    expect(xhr._url).toContain("/api/plugins/feedback-plugin-bongocat/runs/latest");
    expect(xhr._url).toContain("user_id=user-abc");
  });

  it("calls back with parsed run object on 200", async () => {
    return new Promise(function (resolve) {
      rh.fetchLatest(function (err, run) {
        expect(err).toBeNull();
        expect(run).toEqual({
          score: 500,
          mode: "challenge",
          bpm: 120,
        });
        resolve();
      });
      tick().then(function () {
        triggerLoad(200, JSON.stringify({ score: 500, mode: "challenge", bpm: 120 }));
      });
    });
  });

  it("calls back with null run on 204 (no runs)", async () => {
    return new Promise(function (resolve) {
      rh.fetchLatest(function (err, run) {
        expect(err).toBeNull();
        expect(run).toBeNull();
        resolve();
      });
      tick().then(function () {
        triggerLoad(204);
      });
    });
  });

  it("calls back with an error on non-200/204 response", async () => {
    return new Promise(function (resolve) {
      rh.fetchLatest(function (err, run) {
        expect(err).toBeTruthy();
        expect(err.message).toContain("404");
        expect(run).toBeUndefined();
        resolve();
      });
      tick().then(function () {
        triggerLoad(404);
      });
    });
  });

  it("calls back with an error on network failure", async () => {
    return new Promise(function (resolve) {
      rh.fetchLatest(function (err, run) {
        expect(err).toBeTruthy();
        expect(err.message).toContain("network error");
        expect(run).toBeUndefined();
        resolve();
      });
      tick().then(function () {
        triggerError();
      });
    });
  });

  it("calls back with parse error on malformed JSON", async () => {
    return new Promise(function (resolve) {
      rh.fetchLatest(function (err, run) {
        expect(err).toBeTruthy();
        expect(err.message).toContain("failed to parse");
        expect(run).toBeUndefined();
        resolve();
      });
      tick().then(function () {
        triggerLoad(200, "not-json{{{");
      });
    });
  });

  it("does not throw when callback is omitted", async () => {
    expect(function () {
      rh.fetchLatest();
    }).not.toThrow();
  });

  it("caches the user ID (does not call getProfile twice)", async () => {
    rh.fetchLatest();
    await tick();
    expect(sdk.getProfile).toHaveBeenCalledTimes(1);

    rh.fetchLatest();
    await tick();
    expect(sdk.getProfile).toHaveBeenCalledTimes(1);
  });
});

describe("RunHistory — clearCache", () => {
  it("forces a fresh profile fetch on the next call", async () => {
    installMockXHR();
    var sdk = mockSdk({ id: "user-abc" });
    var rh = new RunHistory(sdk);

    rh.fetchLatest();
    await tick();
    expect(sdk.getProfile).toHaveBeenCalledTimes(1);

    rh.clearCache();
    rh.fetchLatest();
    await tick();
    expect(sdk.getProfile).toHaveBeenCalledTimes(2);

    vi.unstubAllGlobals();
  });
});

describe("RunHistory — SDK error handling", () => {
  it("calls back with an error when getProfile rejects", async () => {
    var sdk = {
      getProfile: vi.fn().mockRejectedValue(new Error("network unavailable")),
    };
    var rh = new RunHistory(sdk);

    // In jsdom, Node setTimeout fires before the rejection microtask
    // settles, so flush both microtasks and timer-based macrotasks.
    return new Promise(function (resolve) {
      rh.saveRun({ score: 500 }, function (err) {
        expect(err).toBeTruthy();
        expect(err.message).toContain("failed to get profile");
        resolve();
      });
    });
  });

  it("falls back to the 'local' user id when the profile carries none", async () => {
    // The minigames profile is single-user and has no id field — the save
    // must proceed under a stable local identity instead of failing.
    var sdk = mockSdk({});
    var rh = new RunHistory(sdk);

    return new Promise(function (resolve) {
      rh._resolveUserId(function (err, userId) {
        expect(err).toBeNull();
        expect(userId).toBe("local");
        resolve();
      });
    });
  });
});

describe("RunHistory — hub-tile integration surface", () => {
  it("exposes RunHistory globally for HubTile consumption", () => {
    expect(window.feedBackMinigamesRunHistory).toBeTruthy();
    expect(typeof window.feedBackMinigamesRunHistory.RunHistory).toBe("function");
  });

  it("fetchLatest returns fields HubTile renders (mode, bpm, summary_html)", async () => {
    installMockXHR();
    var sdk = mockSdk({ id: "user-abc" });
    var rh = new RunHistory(sdk);

    return new Promise(function (resolve) {
      rh.fetchLatest(function (err, run) {
        expect(err).toBeNull();
        expect(run).toHaveProperty("mode");
        expect(run).toHaveProperty("bpm");
        resolve();
      });
      tick().then(function () {
        var xhr = /** @type {any} */ (globalThis.XMLHttpRequest)._lastInstance;
        xhr.status = 200;
        xhr.responseText = JSON.stringify({
          mode: "challenge",
          bpm: 140,
          summary_html: "3 patterns",
          score: 950,
          duration_ms: 45000,
        });
        if (typeof xhr.onload === "function") xhr.onload();
      });
    });
  });
});