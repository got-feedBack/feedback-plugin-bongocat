// BeatClock — wraps AudioContext.currentTime as the sole time authority (AD-2)
// Beat time is monotonic per-Run: beat 0 = first count-in beat.
// All ms-to-beat and beat-to-ms conversion lives here.

(function () {
  "use strict";

  function BeatClock() {
    this._audioCtx = null;
    this._beatOffset = 0;  // currentTime at beat 0
    this._bpm = 120;
    this._started = false;
  }

  BeatClock.prototype.create = function () {
    var AudioCtx = window.AudioContext || window.webkitAudioContext;
    this._audioCtx = new AudioCtx();
    return this._audioCtx;
  };

  BeatClock.prototype.getAudioContext = function () {
    return this._audioCtx;
  };

  BeatClock.prototype.resume = function () {
    if (this._audioCtx && this._audioCtx.state === "suspended") {
      return this._audioCtx.resume();
    }
    return Promise.resolve();
  };

  BeatClock.prototype.isRunning = function () {
    return !!(this._audioCtx && this._audioCtx.state === "running");
  };

  BeatClock.prototype.start = function (bpm) {
    this._bpm = bpm || this._bpm;
    this._beatOffset = this._audioCtx.currentTime;
    this._started = true;
  };

  BeatClock.prototype.setBpm = function (bpm) {
    this._bpm = bpm;
  };

  BeatClock.prototype.getBpm = function () {
    return this._bpm;
  };

  // Current beat time (monotonic within a Run)
  BeatClock.prototype.beatTime = function () {
    if (!this._audioCtx || !this._started) return 0;
    var elapsed = this._audioCtx.currentTime - this._beatOffset;
    return elapsed * (this._bpm / 60);
  };

  // Convert ms to beats at current BPM
  BeatClock.prototype.msToBeats = function (ms) {
    return (ms / 1000) * (this._bpm / 60);
  };

  // Convert beats to ms at current BPM
  BeatClock.prototype.beatsToMs = function (beats) {
    return (beats / (this._bpm / 60)) * 1000;
  };

  // Reset for a new Run
  BeatClock.prototype.reset = function () {
    this._beatOffset = 0;
    this._started = false;
  };

  // Schedule a callback at a specific beat using AudioContext lookahead
  BeatClock.prototype.scheduleAtBeat = function (beat, callback) {
    if (!this._audioCtx) return;
    var targetTime = this._beatOffset + this.beatsToMs(beat) / 1000;
    var delayMs = (targetTime - this._audioCtx.currentTime) * 1000;
    if (delayMs <= 0) {
      callback();
      return;
    }
    setTimeout(callback, delayMs);
  };

  BeatClock.prototype.destroy = function () {
    if (this._audioCtx) {
      this._audioCtx.close().catch(function () {});
    }
    this._audioCtx = null;
    this._beatOffset = 0;
    this._started = false;
  };

  if (typeof window.feedBackMinigamesBeatClock === "undefined") {
    window.feedBackMinigamesBeatClock = {};
  }
  window.feedBackMinigamesBeatClock.BeatClock = BeatClock;
})();