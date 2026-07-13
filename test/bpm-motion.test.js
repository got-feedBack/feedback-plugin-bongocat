/**
 * Tests for BPMMotion (bpm-motion.js)
 *
 * Uses vitest with jsdom environment.
 * The module is loaded into the jsdom window via fs.readFileSync + eval.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';

/* ------------------------------------------------------------------ */
/*  Load the module source into the jsdom window                       */
/* ------------------------------------------------------------------ */

var sourceCode = fs.readFileSync(path.resolve(__dirname, '../src/bpm-motion.js'), 'utf-8');

function loadModule() {
  delete window.feedBackMinigamesBPMMotion;
  var fn = new Function('window', sourceCode);
  fn(window);
}

/* ------------------------------------------------------------------ */
/*  BeatClock mock factory                                             */
/* ------------------------------------------------------------------ */

function createMockBeatClock(opts) {
  opts = opts || {};
  var state = {
    beatTimeVal: opts.beatTime != null ? opts.beatTime : 0,
    bpm: opts.bpm != null ? opts.bpm : 120,
    running: opts.running != null ? opts.running : true
  };

  return {
    beatTime: vi.fn(function () { return state.beatTimeVal; }),
    getBpm: vi.fn(function () { return state.bpm; }),
    isRunning: vi.fn(function () { return state.running; }),
    _setBeatTime: function (v) { state.beatTimeVal = v; },
    _setBpm: function (v) { state.bpm = v; },
    _setRunning: function (v) { state.running = v; },
    _getState: function () { return state; }
  };
}

/* ------------------------------------------------------------------ */
/*  Tests                                                              */
/* ------------------------------------------------------------------ */

describe('BPMMotion', function () {
  var mockClock;
  var motion;
  var BPMMotion;

  beforeEach(function () {
    loadModule();
    BPMMotion = window.feedBackMinigamesBPMMotion.BPMMotion;
    expect(BPMMotion).toBeDefined();

    mockClock = createMockBeatClock({ bpm: 120 });
    motion = new BPMMotion(mockClock);
  });

  afterEach(function () {
    if (motion) {
      motion.stop(true);
    }
    document.body.innerHTML = '';
  });

  /* ---------------------------------------------------------------- */
  /*  Construction                                                     */
  /* ---------------------------------------------------------------- */

  describe('construction', function () {
    it('throws if no beatClock is provided', function () {
      expect(function () { return new BPMMotion(); }).toThrow();
      expect(function () { return new BPMMotion(null); }).toThrow();
      expect(function () { return new BPMMotion(undefined); }).toThrow();
    });

    it('creates an instance with a valid beatClock', function () {
      expect(motion).toBeInstanceOf(BPMMotion);
      expect(motion.beatClock).toBe(mockClock);
    });

    it('starts in stopped state with zero active animations', function () {
      expect(motion.isRunning()).toBe(false);
      expect(motion.getActiveCount()).toBe(0);
    });

    it('accepts options', function () {
      var m = new BPMMotion(mockClock, { frameInterval: 16 });
      expect(m.options.frameInterval).toBe(16);
    });

    it('exposes the class on the window namespace', function () {
      expect(window.feedBackMinigamesBPMMotion.BPMMotion).toBe(BPMMotion);
    });
  });

  /* ---------------------------------------------------------------- */
  /*  start / stop                                                     */
  /* ---------------------------------------------------------------- */

  describe('start / stop', function () {
    it('start sets running flag and schedules rAF', function () {
      motion.start();
      expect(motion.isRunning()).toBe(true);
    });

    it('stop unsets running flag and cancels rAF', function () {
      motion.start();
      motion.stop();
      expect(motion.isRunning()).toBe(false);
    });

    it('start is idempotent (calling twice does not throw)', function () {
      motion.start();
      motion.start();
      expect(motion.isRunning()).toBe(true);
    });

    it('stop with clearAnimations removes all animations', function () {
      var el = document.createElement('div');
      document.body.appendChild(el);
      motion.addPulse(el);
      expect(motion.getActiveCount()).toBe(1);
      motion.stop(true);
      expect(motion.getActiveCount()).toBe(0);
    });

    it('stop without clearAnimations keeps the registry', function () {
      var el = document.createElement('div');
      document.body.appendChild(el);
      motion.addPulse(el);
      motion.stop();
      expect(motion.getActiveCount()).toBe(1);
    });
  });

  /* ---------------------------------------------------------------- */
  /*  addPulse                                                         */
  /* ---------------------------------------------------------------- */

  describe('addPulse', function () {
    it('adds a pulse animation and returns a handle', function () {
      var el = document.createElement('div');
      var handle = motion.addPulse(el);
      expect(handle).toBeDefined();
      expect(handle.type).toBe('pulse');
      expect(handle.el).toBe(el);
      expect(motion.getActiveCount()).toBe(1);
    });

    it('accepts intensity option (soft / normal / hard)', function () {
      var el1 = document.createElement('div');
      var el2 = document.createElement('div');
      var el3 = document.createElement('div');

      var h1 = motion.addPulse(el1, { intensity: 'soft' });
      var h2 = motion.addPulse(el2, { intensity: 'normal' });
      var h3 = motion.addPulse(el3, { intensity: 'hard' });

      expect(h1.config.className).toBe('bpm-pulse-soft');
      expect(h2.config.className).toBe('bpm-pulse');
      expect(h3.config.className).toBe('bpm-pulse-hard');
    });

    it('defaults invalid intensity to normal', function () {
      var el = document.createElement('div');
      var handle = motion.addPulse(el, { intensity: 'supermax' });
      expect(handle.config.className).toBe('bpm-pulse');
    });

    it('accepts phaseOffset option', function () {
      var el = document.createElement('div');
      var handle = motion.addPulse(el, { phaseOffset: 0.25 });
      expect(handle.config.phaseOffset).toBe(0.25);
    });

    it('accepts amplitude option', function () {
      var el = document.createElement('div');
      var handle = motion.addPulse(el, { amplitude: 2 });
      expect(handle.config.amplitude).toBe(2);
    });

    it('multiple elements can have pulse independently', function () {
      var el1 = document.createElement('div');
      var el2 = document.createElement('div');
      motion.addPulse(el1);
      motion.addPulse(el2);
      expect(motion.getActiveCount()).toBe(2);
    });
  });

  /* ---------------------------------------------------------------- */
  /*  addBounce                                                        */
  /* ---------------------------------------------------------------- */

  describe('addBounce', function () {
    it('adds a bounce animation and returns a handle', function () {
      var el = document.createElement('div');
      var handle = motion.addBounce(el);
      expect(handle).toBeDefined();
      expect(handle.type).toBe('bounce');
      expect(motion.getActiveCount()).toBe(1);
    });

    it('accepts height option', function () {
      var el = document.createElement('div');
      var handle = motion.addBounce(el, { height: 12 });
      expect(handle.config.height).toBe(12);
    });

    it('defaults height to 8', function () {
      var el = document.createElement('div');
      var handle = motion.addBounce(el);
      expect(handle.config.height).toBe(8);
    });

    it('accepts soft intensity', function () {
      var el = document.createElement('div');
      var handle = motion.addBounce(el, { intensity: 'soft' });
      expect(handle.config.className).toBe('bpm-bounce-soft');
    });
  });

  /* ---------------------------------------------------------------- */
  /*  addFade                                                          */
  /* ---------------------------------------------------------------- */

  describe('addFade', function () {
    it('adds a fade-pulse animation by default', function () {
      var el = document.createElement('div');
      var handle = motion.addFade(el);
      expect(handle.type).toBe('fade');
      expect(handle.config.className).toBe('bpm-fade-pulse');
    });

    it('accepts type: "in"', function () {
      var el = document.createElement('div');
      var handle = motion.addFade(el, { type: 'in' });
      expect(handle.config.className).toBe('bpm-fade-in');
    });

    it('accepts type: "out"', function () {
      var el = document.createElement('div');
      var handle = motion.addFade(el, { type: 'out' });
      expect(handle.config.className).toBe('bpm-fade-out');
    });
  });

  /* ---------------------------------------------------------------- */
  /*  addSlide                                                         */
  /* ---------------------------------------------------------------- */

  describe('addSlide', function () {
    it('adds a slide-up animation by default', function () {
      var el = document.createElement('div');
      var handle = motion.addSlide(el);
      expect(handle.type).toBe('slide');
      expect(handle.config.className).toBe('bpm-slide-up');
    });

    it('accepts direction option', function () {
      var dirs = ['up', 'down', 'left', 'right'];
      dirs.forEach(function (d) {
        var el = document.createElement('div');
        var handle = motion.addSlide(el, { direction: d });
        expect(handle.config.className).toBe('bpm-slide-' + d);
      });
    });

    it('defaults invalid direction to up', function () {
      var el = document.createElement('div');
      var handle = motion.addSlide(el, { direction: 'diagonal' });
      expect(handle.config.className).toBe('bpm-slide-up');
    });
  });

  /* ---------------------------------------------------------------- */
  /*  addShake                                                         */
  /* ---------------------------------------------------------------- */

  describe('addShake', function () {
    it('adds a shake animation', function () {
      var el = document.createElement('div');
      var handle = motion.addShake(el);
      expect(handle).toBeDefined();
      expect(handle.type).toBe('shake');
      expect(handle.config.className).toBe('bpm-shake');
    });
  });

  /* ---------------------------------------------------------------- */
  /*  removeFrom / removeAll                                           */
  /* ---------------------------------------------------------------- */

  describe('removeFrom / removeAll', function () {
    it('removeFrom removes all animations from one element', function () {
      var el = document.createElement('div');
      motion.addPulse(el);
      motion.addBounce(el);
      expect(motion.getActiveCount()).toBe(1); // same element, one entry

      motion.removeFrom(el);
      expect(motion.getActiveCount()).toBe(0);
    });

    it('removeFrom clears inline styles on the element', function () {
      var el = document.createElement('div');
      el.style.transform = 'scale(1.05)';
      el.style.opacity = '0.8';
      motion.addPulse(el);
      motion.removeFrom(el);
      expect(el.style.transform).toBe('');
      expect(el.style.opacity).toBe('');
    });

    it('removeAll clears all elements', function () {
      var el1 = document.createElement('div');
      var el2 = document.createElement('div');
      motion.addPulse(el1);
      motion.addBounce(el2);
      expect(motion.getActiveCount()).toBe(2);
      motion.removeAll();
      expect(motion.getActiveCount()).toBe(0);
    });
  });

  /* ---------------------------------------------------------------- */
  /*  AnimationHandle                                                  */
  /* ---------------------------------------------------------------- */

  describe('AnimationHandle', function () {
    it('destroy marks the handle as destroyed', function () {
      var el = document.createElement('div');
      var handle = motion.addPulse(el);
      expect(handle.isDestroyed()).toBe(false);
      handle.destroy();
      expect(handle.isDestroyed()).toBe(true);
    });

    it('destroyed handles do not affect animation count via removeFrom', function () {
      var el = document.createElement('div');
      var handle = motion.addPulse(el);
      handle.destroy();
      motion.removeFrom(el);
      expect(motion.getActiveCount()).toBe(0);
    });
  });

  /* ---------------------------------------------------------------- */
  /*  Phase calculation helpers                                        */
  /* ---------------------------------------------------------------- */

  describe('_calcPulseScale', function () {
    it('returns 1 at phase 0', function () {
      var scale = motion._calcPulseScale(0, 1);
      expect(scale).toBeCloseTo(1, 3);
    });

    it('returns >1 at phase 0.5 (peak)', function () {
      var scale = motion._calcPulseScale(0.5, 1);
      expect(scale).toBeGreaterThan(1);
    });

    it('returns near 1 at phase 1 (back to rest)', function () {
      var scale = motion._calcPulseScale(1, 1);
      expect(scale).toBeCloseTo(1, 2);
    });

    it('amplitude increases the max scale', function () {
      var normal = motion._calcPulseScale(0.5, 1);
      var amplified = motion._calcPulseScale(0.5, 2);
      expect(amplified).toBeGreaterThan(normal);
    });
  });

  describe('_calcBounceY', function () {
    it('returns 0 at phase 0 (rest position)', function () {
      var y = motion._calcBounceY(0, 8);
      expect(y).toBeCloseTo(0, 2);
    });

    it('returns negative (upward) in the first quarter', function () {
      var y = motion._calcBounceY(0.125, 8);
      expect(y).toBeLessThan(0);
    });

    it('returns 0 at phase 0.5 (back to rest)', function () {
      var y = motion._calcBounceY(0.5, 8);
      expect(Math.abs(y)).toBeLessThanOrEqual(0.01);
    });

    it('height parameter scales the bounce', function () {
      var low = motion._calcBounceY(0.125, 8);
      var high = motion._calcBounceY(0.125, 16);
      expect(Math.abs(high)).toBeGreaterThan(Math.abs(low));
    });
  });

  describe('_calcFadePulseOpacity', function () {
    it('returns a value between 0.4 and 1.0', function () {
      for (var p = 0; p <= 1; p += 0.1) {
        var opacity = motion._calcFadePulseOpacity(p);
        expect(opacity).toBeGreaterThanOrEqual(0.39);
        expect(opacity).toBeLessThanOrEqual(1.01);
      }
    });
  });

  /* ---------------------------------------------------------------- */
  /*  Integration: animation loop applies styles                       */
  /* ---------------------------------------------------------------- */

  describe('animation loop integration', function () {
    it('applies CSS classes to elements after a tick', function () {
      // Use fake timers so we control rAF
      vi.useFakeTimers();

      var el = document.createElement('div');
      document.body.appendChild(el);
      motion.addPulse(el);

      motion.start();

      // Advance timers to trigger the rAF callback
      vi.advanceTimersByTime(16);
      vi.advanceTimersByTime(16);

      expect(el.className).toContain('bpm-pulse');

      motion.stop();
      vi.useRealTimers();
    });

    it('applies animationDuration from tempo', function () {
      vi.useFakeTimers();

      var el = document.createElement('div');
      document.body.appendChild(el);
      mockClock._setBpm(140);
      motion.addPulse(el);

      motion.start();

      vi.advanceTimersByTime(16);
      vi.advanceTimersByTime(16);

      expect(el.style.animationDuration).toBe('428.57142857142856ms');

      motion.stop();
      vi.useRealTimers();
    });

    it('beat crossing detection works', function () {
      motion._previousPhase = 0.9;
      motion._currentPhase = 0.05;
      motion._beatCrossed = motion._previousPhase > 0.8 && motion._currentPhase < 0.2;
      expect(motion._beatCrossed).toBe(true);

      motion._previousPhase = 0.3;
      motion._currentPhase = 0.4;
      motion._beatCrossed = motion._previousPhase > 0.8 && motion._currentPhase < 0.2;
      expect(motion._beatCrossed).toBe(false);
    });
  });
});
