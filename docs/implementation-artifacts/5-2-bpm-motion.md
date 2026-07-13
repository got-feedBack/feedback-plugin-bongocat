---
baseline_commit: 6dd627fcda5f96089112bd65434e334a4f288a58
---

# 5.2 BPM Motion

- **Status:** review
- **Module:** `src/bpm-motion.js`
- **Export:** `window.feedBackMinigamesBPMMotion.BPMMotion`
- **CSS:** `src/bpm-motion.css`
- **Depends on:** `window.feedBackMinigamesBeatClock.BeatClock` (beat-time authority)

## Tasks

- [x] Create `src/bpm-motion.js` with BPMMotion class (IIFE pattern, same as other modules)
- [x] Expose as `window.feedBackMinigamesBPMMotion.BPMMotion`
- [x] Constructor accepts `beatClock` instance and optional `{ frameInterval }` option
- [x] `addPulse(el, opts)` — scale pulse on beat; intensities: `soft` / `normal` (default) / `hard`
- [x] `addBounce(el, opts)` — vertical bounce; configurable `height` (px), `intensity`
- [x] `addFade(el, opts)` — opacity animation; types: `pulse` (default) / `in` / `out`
- [x] `addSlide(el, opts)` — translational slide from a direction; `up` / `down` / `left` / `right`
- [x] `addShake(el, opts)` — horizontal shake accent
- [x] Every `add*` method returns an `AnimationHandle` with `destroy()` / `isDestroyed()`
- [x] `start()` — begins `requestAnimationFrame` loop that polls `beatClock` and updates each element
- [x] `stop(clearAnimations)` — stops the loop; optionally removes all animations
- [x] `removeFrom(el)` — removes all animations from one element, clears inline styles
- [x] `removeAll()` — removes all animations from all elements
- [x] `isRunning()` / `getActiveCount()` — introspection
- [x] Uses actual BeatClock API: `beatTime()` (monotonic beat count), `getBpm()`, `isRunning()`
- [x] Derives phase from `beatTime() % 1` and beat number from `Math.floor(beatTime())`
- [x] Beat-crossing detection (phase wraps ~1→0)
- [x] CSS keyframes in separate `src/bpm-motion.css` file
- [x] CSS keyframes: `bpm-pulse`, `bpm-pulse-soft`, `bpm-pulse-hard`, `bpm-bounce`, `bpm-bounce-soft`, `bpm-fade-in`, `bpm-fade-out`, `bpm-fade-pulse`, `bpm-slide-up/down/left/right`, `bpm-shake`
- [x] Static utility CSS classes for each animation variant
- [x] `animationDuration` dynamically set from `60000 / tempo` (ms) per tick
- [x] Dynamic inline transforms for pulse (scale), bounce (translateY), fade-pulse (opacity) for tighter beat-sync
- [x] Exported via `@import url("src/bpm-motion.css")` in `styles.css`
- [x] Write comprehensive test suite at `test/bpm-motion.test.js`
- [x] All tests pass (44 tests, 0 failures)

## Description

The BPMMotion class provides a generic BPM-synchronised animation system that can attach to any DOM element. It wraps beatClock timing with a `requestAnimationFrame` loop and applies both CSS keyframe classes and dynamic inline transforms.

### Usage

```js
var motion = new BPMMotion(myBeatClock);

// Pulse
var pulseHandle = motion.addPulse(el, { intensity: 'hard' });

// Bounce
var bounceHandle = motion.addBounce(el, { height: 12 });

// Fade
var fadeHandle = motion.addFade(el, { type: 'pulse' });

// Slide
var slideHandle = motion.addSlide(el, { direction: 'right' });

// Shake (accent)
var shakeHandle = motion.addShake(el);

motion.start(); // begin the animation loop

// Later...
motion.removeFrom(el);    // stop animating a specific element
motion.stop(true);        // stop the loop and clear everything
```

### beatClock contract

BPMMotion uses these methods from the beatClock instance:

| Method          | Returns         | Used for                                   |
|-----------------|-----------------|--------------------------------------------|
| `beatTime()`    | float (beats)   | Phase = `beatTime() % 1`, beat = `Math.floor(beatTime())` |
| `getBpm()`      | number (BPM)    | Animation duration = `60000 / getBpm()` ms |
| `isRunning()`   | boolean         | (reserved)                                 |

### Animation types

| Type     | Options                                    | CSS class        | Dynamic style      |
|----------|--------------------------------------------|------------------|--------------------|
| pulse    | `intensity`, `phaseOffset`, `amplitude`    | `bpm-pulse*`     | `transform: scale` |
| bounce   | `height`, `intensity`, `phaseOffset`       | `bpm-bounce*`    | `transform: translateY` |
| fade     | `type` (pulse/in/out), `phaseOffset`       | `bpm-fade-*`     | `opacity` (pulse)  |
| slide    | `direction` (up/down/left/right)           | `bpm-slide-*`    | —                  |
| shake    | `phaseOffset`                              | `bpm-shake`      | —                  |

### CSS keyframes (`src/bpm-motion.css`)

All keyframes and utility classes are prefixed with `bpm-`:
- `bpm-pulse` / `bpm-pulse-soft` / `bpm-pulse-hard` — scale 1→1.08/1.04/1.15 at beat peak
- `bpm-bounce` / `bpm-bounce-soft` — double-bounce per beat (two peaks)
- `bpm-fade-in` / `bpm-fade-out` / `bpm-fade-pulse` — opacity transitions
- `bpm-slide-up` / `bpm-slide-down` / `bpm-slide-left` / `bpm-slide-right` — translate + fade
- `bpm-shake` — horizontal oscillation for off-beat emphasis

## File List

- `src/bpm-motion.js` — BPMMotion class implementation
- `src/bpm-motion.css` — Animation keyframes and static utility classes
- `styles.css` — Added `@import url("src/bpm-motion.css")` at top
- `test/bpm-motion.test.js` — comprehensive test suite (44 tests)

## Change Log

| Date       | Change                             |
|------------|-------------------------------------|
| 2026-07-12 | Initial implementation (all tasks)  |

## ADRs

- **Separate CSS file:** Animation keyframes live in `src/bpm-motion.css` rather than inline in the JS or appended to `styles.css` directly. This keeps concerns separated (CSS animations vs. JS logic) and lets consumers opt in by importing the file. The `@import` in `styles.css` ensures the keyframes are available to the full game without an extra `<link>` tag.
- **Dual rendering approach:** Both CSS keyframes and dynamic inline `style` transforms are applied. The CSS class handles the baseline animation shape (visible immediately, degrades gracefully if JS stops), while the inline `transform`/`opacity` overrides it per-frame for tighter phase-sync with the actual beatClock reading. This gives the best of both worlds: smooth CSS transitions plus exact beat alignment.
- **Phase derivation from beatTime():** The existing BeatClock only exposes `beatTime()` (monotonic beat count). Deriving phase as `beatTime() % 1` and beat number as `Math.floor(beatTime())` avoids needing new methods on beatClock. The `% 1` operation is stable and handles the wrap from beat boundary cleanly (though high-precision floats near integer values could see an occasional sub-ULP error, which is visually irrelevant at 60fps).
- **Two-bounce formula:** The bounce animation simulates a natural double-bounce (like a bouncing ball that settles) within a single beat. The first bounce reaches full height, the second reaches half height, and the element returns to rest at phase 0.5/1.0. This creates a more organic feel than a single sinusoidal bounce per beat.
- **AnimationHandle pattern:** Each `add*()` call returns a lightweight handle object so consumers can selectively destroy individual animations without removing all animations from an element. This follows the pattern established by the HUD's grade badge timer.
