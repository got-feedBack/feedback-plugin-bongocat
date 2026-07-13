/**
 * BPMMotion — BPM-synchronized DOM animations
 *
 * Animates elements (pulse, bounce, fade, slide) in sync with BPM timing.
 * Uses beatClock for timing and requestAnimationFrame for rendering.
 *
 * Attach to any DOM element via:
 *   motion.addPulse(element, { intensity: 'soft' })
 *   motion.addBounce(element, { height: 12 })
 *   motion.addFade(element, { type: 'pulse' })
 *   motion.addSlide(element, { direction: 'up' })
 *
 * Dependencies:
 *   - beatClock (window.feedBackMinigamesBeatClock.BeatClock)
 *     Must expose: beatTime() → float (monotonic beat count),
 *                  getBpm() → number,
 *                  isRunning() → boolean
 *
 * Exposed as: window.feedBackMinigamesBPMMotion.BPMMotion
 *
 * Related CSS: src/bpm-motion.css (animation keyframes and static utility classes)
 */
(function (window) {
  'use strict';

  var BPMMotion = function (beatClock, options) {
    if (!beatClock) {
      throw new Error('BPMMotion requires a beatClock instance');
    }

    this.beatClock = beatClock;
    this.options = Object.assign({
      // Global default frame interval (ms). If null, runs every rAF frame.
      frameInterval: null
    }, options || {});

    // Registry of active animations: Map<element, Array<AnimationHandle>>
    this._registry = new Map();

    // rAF loop state
    this._rafId = null;
    this._lastFrameTime = 0;
    this._running = false;

    // Phase cache for internal calculation
    this._currentPhase = 0;
    this._previousPhase = 0;
    this._currentBeat = 0;
    this._tempo = 120;

    // Beat-crossing detection (to fire attack/on-beat resets)
    this._beatCrossed = false;
  };

  /* ------------------------------------------------------------------ */
  /*  Animation handle                                                   */
  /* ------------------------------------------------------------------ */

  /**
   * Internal handle representing one registered animation on one element.
   * @param {Element} el        The DOM element
   * @param {string}  type      'pulse' | 'bounce' | 'fade' | 'slide' | 'shake'
   * @param {Object}  config    Per-animation config
   */
  function AnimationHandle(el, type, config) {
    this.el = el;
    this.type = type;
    this.config = config;
    this._destroyed = false;
  }

  AnimationHandle.prototype.destroy = function () {
    this._destroyed = true;
  };

  AnimationHandle.prototype.isDestroyed = function () {
    return this._destroyed;
  };

  /* ------------------------------------------------------------------ */
  /*  Static animation-name → class mapping (used by addPulse etc.)      */
  /* ------------------------------------------------------------------ */

  var ANIMATION_CLASSES = {
    'pulse':        'bpm-pulse',
    'pulse-soft':   'bpm-pulse-soft',
    'pulse-hard':   'bpm-pulse-hard',
    'bounce':       'bpm-bounce',
    'bounce-soft':  'bpm-bounce-soft',
    'fade-in':      'bpm-fade-in',
    'fade-out':     'bpm-fade-out',
    'fade-pulse':   'bpm-fade-pulse',
    'slide-up':     'bpm-slide-up',
    'slide-down':   'bpm-slide-down',
    'slide-left':   'bpm-slide-left',
    'slide-right':  'bpm-slide-right',
    'shake':        'bpm-shake'
  };

  /* ------------------------------------------------------------------ */
  /*  Public API                                                         */
  /* ------------------------------------------------------------------ */

  /**
   * Attach a pulse animation to an element.
   * @param {Element} el          Target DOM element
   * @param {Object}  [opts]
   * @param {string}  [opts.intensity='normal']  'soft' | 'normal' | 'hard'
   * @param {number}  [opts.phaseOffset=0]       Beat phase offset [0-1)
   * @param {string}  [opts.easing='ease-in-out']
   * @param {number}  [opts.amplitude=1]         Scale multiplier amplitude
   * @returns {AnimationHandle}
   */
  BPMMotion.prototype.addPulse = function (el, opts) {
    opts = opts || {};
    var intensity = opts.intensity || 'normal';
    if (['soft', 'normal', 'hard'].indexOf(intensity) === -1) {
      intensity = 'normal';
    }
    var className = intensity === 'normal' ? 'bpm-pulse'
      : intensity === 'soft' ? 'bpm-pulse-soft'
      : 'bpm-pulse-hard';

    var handle = new AnimationHandle(el, 'pulse', {
      className: className,
      phaseOffset: opts.phaseOffset || 0,
      easing: opts.easing || 'ease-in-out',
      amplitude: opts.amplitude != null ? opts.amplitude : 1
    });

    this._register(el, handle);
    return handle;
  };

  /**
   * Attach a bounce animation to an element.
   * @param {Element} el
   * @param {Object}  [opts]
   * @param {number}  [opts.height=8]            Bounce height in px
   * @param {number}  [opts.phaseOffset=0]
   * @param {string}  [opts.easing='ease-in-out']
   * @returns {AnimationHandle}
   */
  BPMMotion.prototype.addBounce = function (el, opts) {
    opts = opts || {};
    var intensity = opts.intensity || 'normal';
    var className = intensity === 'soft' ? 'bpm-bounce-soft' : 'bpm-bounce';

    var handle = new AnimationHandle(el, 'bounce', {
      className: className,
      height: opts.height != null ? opts.height : 8,
      phaseOffset: opts.phaseOffset || 0,
      easing: opts.easing || 'ease-in-out'
    });

    this._register(el, handle);
    return handle;
  };

  /**
   * Attach a fade animation to an element.
   * @param {Element} el
   * @param {Object}  [opts]
   * @param {string}  [opts.type='pulse']         'pulse' | 'in' | 'out'
   * @param {number}  [opts.phaseOffset=0]
   * @returns {AnimationHandle}
   */
  BPMMotion.prototype.addFade = function (el, opts) {
    opts = opts || {};
    var type = opts.type || 'pulse';
    var className;
    if (type === 'in') {
      className = 'bpm-fade-in';
    } else if (type === 'out') {
      className = 'bpm-fade-out';
    } else {
      className = 'bpm-fade-pulse';
    }

    var handle = new AnimationHandle(el, 'fade', {
      className: className,
      phaseOffset: opts.phaseOffset || 0,
      fadeType: type
    });

    this._register(el, handle);
    return handle;
  };

  /**
   * Attach a slide animation to an element.
   * @param {Element} el
   * @param {Object}  [opts]
   * @param {string}  [opts.direction='up']       'up' | 'down' | 'left' | 'right'
   * @param {number}  [opts.phaseOffset=0]
   * @returns {AnimationHandle}
   */
  BPMMotion.prototype.addSlide = function (el, opts) {
    opts = opts || {};
    var dir = opts.direction || 'up';
    var className = 'bpm-slide-' + dir;
    if (!ANIMATION_CLASSES[className.replace('bpm-', '')]) {
      className = 'bpm-slide-up';
    }

    var handle = new AnimationHandle(el, 'slide', {
      className: className,
      direction: dir,
      phaseOffset: opts.phaseOffset || 0
    });

    this._register(el, handle);
    return handle;
  };

  /**
   * Attach a shake accent animation to an element.
   * @param {Element} el
   * @param {Object}  [opts]
   * @param {number}  [opts.phaseOffset=0]
   * @returns {AnimationHandle}
   */
  BPMMotion.prototype.addShake = function (el, opts) {
    opts = opts || {};
    var handle = new AnimationHandle(el, 'shake', {
      className: 'bpm-shake',
      phaseOffset: opts.phaseOffset || 0
    });
    this._register(el, handle);
    return handle;
  };

  /**
   * Remove all animations from a specific element.
   * @param {Element} el
   */
  BPMMotion.prototype.removeFrom = function (el) {
    var handles = this._registry.get(el);
    if (handles) {
      handles.forEach(function (h) { h.destroy(); });
      this._registry.delete(el);
      this._clearInlineStyles(el);
    }
  };

  /**
   * Remove all animations from all elements.
   */
  BPMMotion.prototype.removeAll = function () {
    var self = this;
    this._registry.forEach(function (handles, el) {
      self.removeFrom(el);
    });
  };

  /**
   * Start the animation loop.
   */
  BPMMotion.prototype.start = function () {
    if (this._running) { return; }
    this._running = true;
    this._lastFrameTime = 0;
    this._tick();
  };

  /**
   * Stop the animation loop and optionally remove all animations.
   * @param {boolean} [clearAnimations=false]  Remove all registered animations
   */
  BPMMotion.prototype.stop = function (clearAnimations) {
    this._running = false;
    if (this._rafId) {
      cancelAnimationFrame(this._rafId);
      this._rafId = null;
    }
    if (clearAnimations) {
      this.removeAll();
    }
  };

  /**
   * Check if the loop is running.
   * @returns {boolean}
   */
  BPMMotion.prototype.isRunning = function () {
    return this._running;
  };

  /**
   * Get the count of active animated elements.
   * @returns {number}
   */
  BPMMotion.prototype.getActiveCount = function () {
    return this._registry.size;
  };

  /* ------------------------------------------------------------------ */
  /*  Internal                                                           */
  /* ------------------------------------------------------------------ */

  BPMMotion.prototype._register = function (el, handle) {
    if (!this._registry.has(el)) {
      this._registry.set(el, []);
    }
    this._registry.get(el).push(handle);
  };

  BPMMotion.prototype._clearInlineStyles = function (el) {
    el.style.transform = '';
    el.style.opacity = '';
    el.style.animation = '';
    el.style.animationName = '';
    el.style.animationDuration = '';
    el.style.animationTimingFunction = '';
    el.style.animationIterationCount = '';
  };

  /**
   * Main render loop — runs via requestAnimationFrame.
   */
  BPMMotion.prototype._tick = function () {
    var self = this;
    if (!self._running) { return; }

    self._rafId = requestAnimationFrame(function (timestamp) {
      if (!self._running) { return; }

      // Rate-limit by frameInterval
      if (self.options.frameInterval && self._lastFrameTime) {
        var elapsed = timestamp - self._lastFrameTime;
        if (elapsed < self.options.frameInterval) {
          self._tick();
          return;
        }
      }
      self._lastFrameTime = timestamp;

      // Read beat state from the beatClock API
      // beatTime() returns monotonic beat count (e.g. 5.73)
      var bt = self.beatClock.beatTime();
      self._currentBeat = Math.floor(bt);
      self._currentPhase = bt % 1;         // fractional part → phase [0, 1)
      self._tempo = self.beatClock.getBpm();

      // Detect beat crossing (phase wraps from ~1 back to 0)
      self._beatCrossed = (
        self._previousPhase > 0.8 &&
        self._currentPhase < 0.2
      );
      self._previousPhase = self._currentPhase;

      // Tick all registered animations
      self._registry.forEach(function (handles /*, el */) {
        // Filter destroyed handles
        var alive = [];
        for (var i = 0; i < handles.length; i++) {
          if (!handles[i].isDestroyed()) {
            alive.push(handles[i]);
          }
        }
        // If all dead, skip — will be cleaned next pass
        if (alive.length === 0) { return; }

        for (var j = 0; j < alive.length; j++) {
          self._applyAnimation(alive[j]);
        }
      });

      // Schedule next frame
      self._tick();
    });
  };

  /**
   * Apply a single animation handle's transform/opacity based on beat phase.
   *
   * Built-in CSS animation classes handle most cases. For pulse/bounce we
   * additionally apply dynamic transforms for finer beat-synced control.
   */
  BPMMotion.prototype._applyAnimation = function (handle) {
    var el = handle.el;
    var phase = (this._currentPhase + (handle.config.phaseOffset || 0)) % 1;
    var config = handle.config;

    // Apply CSS animation class as a baseline
    if (config.className) {
      // Only add the class once (check by prefix)
      var classToAdd = config.className;
      if (el.className.indexOf(classToAdd) === -1) {
        el.className += ' ' + classToAdd;
      }

      // Set animation duration based on tempo
      var beatDurationMs = 60000 / this._tempo;
      el.style.animationDuration = beatDurationMs + 'ms';
      el.style.animationTimingFunction = config.easing || 'ease-in-out';
      el.style.animationIterationCount = 'infinite';
    }

    // For pulse, add a dynamic transform on top of the CSS keyframes
    // that tightens the visual sync with the exact beat phase
    if (handle.type === 'pulse') {
      var scale = this._calcPulseScale(phase, config.amplitude || 1);
      el.style.transform = 'scale(' + scale + ')';
    }

    // For bounce, apply dynamic translateY
    if (handle.type === 'bounce') {
      var height = config.height || 8;
      var y = this._calcBounceY(phase, height);
      el.style.transform = 'translateY(' + y + 'px)';
    }

    // For fade-pulse, apply dynamic opacity
    if (handle.type === 'fade' && config.fadeType === 'pulse') {
      el.style.opacity = this._calcFadePulseOpacity(phase);
    }
  };

  /**
   * Calculate a scale value for pulse animation based on beat phase.
   * Phase 0 → 1 (peak), Phase 0.5 → 0 (rest)
   * @param {number} phase      Beat phase [0-1)
   * @param {number} amplitude  Scale multiplier (1 = normal)
   * @returns {number}
   */
  BPMMotion.prototype._calcPulseScale = function (phase, amplitude) {
    // sin from -π/2 to π/2 mapped to [0, π] gives a smooth pulse
    var sinVal = Math.sin(phase * Math.PI);
    // Map from [0, 1] to scale [1, 1 + 0.08 * amplitude]
    var maxScale = 1 + 0.08 * amplitude;
    return 1 + (sinVal * (maxScale - 1));
  };

  /**
   * Calculate Y-offset for bounce animation.
   * @param {number} phase
   * @param {number} height    Max bounce height in px
   * @returns {number}         Negative = upward
   */
  BPMMotion.prototype._calcBounceY = function (phase, height) {
    // Two bounces per beat: quick up, quick down, smaller up, quick down
    var t = phase * 4; // 0-4 within one beat
    if (t < 1) {
      // First bounce up
      return -height * Math.sin(t * Math.PI / 2);
    } else if (t < 2) {
      // First bounce down
      return -height * Math.cos((t - 1) * Math.PI / 2);
    } else if (t < 3) {
      // Second smaller bounce up
      return -(height * 0.5) * Math.sin((t - 2) * Math.PI / 2);
    } else {
      // Second bounce down
      return -(height * 0.5) * Math.cos((t - 3) * Math.PI / 2);
    }
  };

  /**
   * Calculate opacity for fade-pulse animation (pulses opacity with beat).
   * @param {number} phase
   * @returns {number}
   */
  BPMMotion.prototype._calcFadePulseOpacity = function (phase) {
    return 0.4 + 0.6 * (0.5 + 0.5 * Math.sin(phase * 2 * Math.PI));
  };

  /* ------------------------------------------------------------------ */
  /*  Expose                                                             */
  /* ------------------------------------------------------------------ */

  window.feedBackMinigamesBPMMotion = window.feedBackMinigamesBPMMotion || {};
  window.feedBackMinigamesBPMMotion.BPMMotion = BPMMotion;

})(window);
