---
baseline_commit: 6dd627fcda5f96089112bd65434e334a4f288a58
---

# 3-4 HUD

- **Status:** review
- **Module:** `src/hud.js`
- **Export:** `window.feedBackMinigamesHUD.HUD`

## Tasks

- [x] Create `src/hud.js` with HUD class (IIFE pattern, same as other modules)
- [x] Expose as `window.feedBackMinigamesHUD.HUD`
- [x] Score display (numeric, animated with ease-out cubic interpolation)
- [x] Lives display (hearts: filled `♥` / empty `♡`)
- [x] Streak counter
- [x] Grade badges: `Perfect!`, `Good`, `Miss!` flash on result with pop-in animation
- [x] Phase indicator (`Learning` / `Challenge`)
- [x] BPM display
- [x] Reads from StateContext via `subscribe` — updates score, lives, streak, phase
- [x] `setBpm(bpm)` — updates BPM display
- [x] `showGrade(grade)` — accepts grade string or patternResult object; auto-determines dominant grade
- [x] `render()` — builds DOM, idempotent
- [x] `destroy()` — cleans up DOM, cancels animation, clears timers, unsubscribes from StateContext
- [x] `onGradeFlash` callback fires when a grade badge is shown
- [x] Score animation: `requestAnimationFrame` loop with cubic ease-out, animates from old score to new
- [x] Grade badge auto-hides after `GRADE_FLASH_MS` (1200ms, from tunables)
- [x] CSS scoped under `.bc-game-root` with `bc-game-root__hud-*` classes
- [x] `bc-grade-flash` CSS keyframe animation for grade badge pop-in
- [x] aria-live on grade badge for accessibility
- [x] aria-label on lives display
- [x] Write comprehensive test suite at `test/hud.test.js`

## Description

The HUD (Heads-Up Display) class renders a horizontal bar showing the player's score,
lives, streak, grade feedback, phase, and BPM. It subscribes to StateContext to
automatically reflect state changes in the UI.

### Usage

```js
var hud = new HUD(containerEl, {
  stateContext: myStateContext,  // subscribes for score/lives/streak/phase
  bpm: 80,                       // initial BPM display
  onGradeFlash: function (grade) { /* ... */ },
});
hud.render();

// Update BPM externally
hud.setBpm(120);

// Flash a grade badge (string or patternResult)
hud.showGrade("perfect");         // "Perfect!"
hud.showGrade("good");            // "Good"
hud.showGrade("miss");            // "Miss!"
hud.showGrade(patternResult);     // dominant grade from result

hud.destroy(); // Cleanup
```

### StateContext integration

The HUD subscribes to StateContext via `subscribe()` and handles these snapshot fields:

| Field    | Effect                                      |
|----------|---------------------------------------------|
| `score`  | Starts animated count-up from old value     |
| `lives`  | Re-renders hearts (filled/empty)            |
| `streak` | Updates streak counter text                 |
| `phase`  | Updates phase indicator label               |

### Grade badge visual mapping

| Grade        | Label      | CSS class                  | Colour |
|--------------|------------|----------------------------|--------|
| `perfect`    | Perfect!   | `--hud-grade--perfect`     | Green  |
| `good`       | Good       | `--hud-grade--good`        | Amber  |
| `miss`       | Miss!      | `--hud-grade--miss`        | Red    |
| `miss-extra` | Miss!      | `--hud-grade--miss`        | Red    |

### Dominant grade resolution

When `showGrade` receives a patternResult object, the dominant grade is determined by worst-first priority:
1. If any `misses > 0` or `extras > 0` → `"miss"`
2. If any `goods > 0` → `"good"`
3. If all `perfects > 0` → `"perfect"`
4. Fallback: scan `grades` array for the same priority

### CSS classes

All classes prefixed with `bc-game-root__`:
- `.bc-game-root__hud` — root container (flex row)
- `.bc-game-root__hud-score-wrap` / `.bc-game-root__hud-score` — score display
- `.bc-game-root__hud-lives-wrap` / `.bc-game-root__hud-lives` — lives container
- `.bc-game-root__hud-heart` / `.bc-game-root__hud-heart--empty` — individual hearts
- `.bc-game-root__hud-streak-wrap` / `.bc-game-root__hud-streak` — streak counter
- `.bc-game-root__hud-grade` — grade badge (absolute positioned, centred)
- `.bc-game-root__hud-grade--perfect` / `--good` / `--miss` — grade colour variants
- `.bc-game-root__hud-phase-wrap` / `.bc-game-root__hud-phase` — phase indicator
- `.bc-game-root__hud-bpm-wrap` / `.bc-game-root__hud-bpm` — BPM display
- `.bc-game-root__hud-label` — shared label style (uppercase, muted)

### DOM structure

```html
<div class="bc-game-root__hud">
  <div class="bc-game-root__hud-score-wrap">
    <span class="bc-game-root__hud-label">Score</span>
    <span class="bc-game-root__hud-score">1,234</span>
  </div>
  <div class="bc-game-root__hud-lives-wrap">
    <span class="bc-game-root__hud-lives" aria-label="Lives: 2">
      <span class="bc-game-root__hud-heart">♥</span>
      <span class="bc-game-root__hud-heart">♥</span>
      <span class="bc-game-root__hud-heart bc-game-root__hud-heart--empty">♡</span>
    </span>
  </div>
  <div class="bc-game-root__hud-streak-wrap">
    <span class="bc-game-root__hud-label">Streak</span>
    <span class="bc-game-root__hud-streak">7</span>
  </div>
  <div class="bc-game-root__hud-grade bc-game-root__hud-grade--perfect"
       aria-live="polite" style="display: none;">Perfect!</div>
  <div class="bc-game-root__hud-phase-wrap">
    <span class="bc-game-root__hud-phase">Learning</span>
  </div>
  <div class="bc-game-root__hud-bpm-wrap">
    <span class="bc-game-root__hud-bpm">80 BPM</span>
  </div>
</div>
```

## Dev Agent Record

- **Agent:** Claude Code (DeepSeek v4 Flash)
- **Date:** 2026-07-12
- **Task:** Implement HUD per AD-13, NFR-22
- **Approach:** Followed existing IIFE + window namespace pattern. Score animation uses `requestAnimationFrame` with cubic ease-out interpolation. Hearts render as inline spans with `♥`/`♡` characters. Grade badge is absolute-positioned over the centre of the HUD bar with a pop-in animation. StateContext subscription mirrors the pattern used by FSM transitions. Initial state is read from the context's `getSnapshot()` at construction time.

## File List

- `src/hud.js` — HUD class implementation
- `styles.css` — CSS additions for HUD (appended, ~160 lines)
- `test/hud.test.js` — comprehensive test suite (10 describe blocks, 82 tests)
- `docs/implementation-artifacts/3-4-hud.md` — this file

## Change Log

| Date       | Change                             |
|------------|-------------------------------------|
| 2026-07-12 | Initial implementation (all tasks)  |

## ADRs

- **Score animation:** `requestAnimationFrame` with cubic ease-out rather than discrete jumps. Makes score changes feel responsive without being distracting. 400ms duration keeps the animation snappy while still being noticeable.
- **Hearts as characters:** Using `♥`/`♡` Unicode characters rather than SVG or images. Keeps the DOM lightweight and avoids asset loading. The `♡` character with reduced opacity clearly communicates lost lives.
- **Grade badge positioning:** Absolute-positioned at the centre of the HUD bar so it overlays the display without shifting other elements. Auto-hides after 1200ms via `setTimeout`.
- **Dominant grade logic:** Worst-first priority (miss > good > perfect) ensures the player sees the most critical feedback. A single miss among perfects still shows "Miss!".
- **Initial state from context:** The constructor reads `getSnapshot()` from the StateContext at construction time so the initial display reflects the game's actual state, not hardcoded defaults.