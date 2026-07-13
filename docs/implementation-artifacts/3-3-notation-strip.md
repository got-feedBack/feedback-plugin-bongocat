---
baseline_commit: 6dd627fcda5f96089112bd65434e334a4f288a58
---

# 3-3 Notation Strip

- **Status:** review
- **Module:** `src/notation-strip.js`
- **Export:** `window.feedBackMinigamesNotationStrip.NotationStrip`

## Tasks

- [x] Create `src/notation-strip.js` with NotationStrip class (IIFE pattern, same as other modules)
- [x] Expose as `window.feedBackMinigamesNotationStrip.NotationStrip`
- [x] States: `idle`, `playing`, `done` with STATE enum exposed as `NotationStrip.STATE`
- [x] `render()` — builds DOM (track, indicator, beat label, aria-live label)
- [x] `setPattern(pattern)` — renders slot blocks as proportional-width divs with `--onset` / `--rest` CSS classes
- [x] Onset markers (blue dots) at each expected onset position within the track
- [x] `start()` — begins requestAnimationFrame loop that polls beatClock and moves indicator
- [x] `stop()` — stops animation, returns to idle, clears hit markers
- [x] `reset()` — clears pattern, pattern result, hit markers, returns to idle
- [x] `handlePatternResult(patternResult)` — renders hit/miss feedback markers with colour-coded CSS classes
- [x] `destroy()` — cleans up DOM, animation frame, judge hook
- [x] Beat indicator (red vertical line with triangle arrowhead) moves linearly from left to right
- [x] Beat number label below track counting current bar beat (1-4)
- [x] Hit feedback: `perfect` (green checkmark), `good` (amber dot), `miss` (red X), `miss-extra` (grey dash, dashed border)
- [x] `bc-hit-pop` CSS animation for hit marker appearance
- [x] Judge integration: hooks into judge's `_onResult` callback, preserving existing chain
- [x] CSS scoped under `.bc-game-root` with state classes (`--playing`, `--done`, hides indicator when `--idle`/`--done`)
- [x] aria-live label for accessibility
- [x] Write comprehensive test suite at `test/notation-strip.test.js`

## Description

The NotationStrip class renders a horizontal scrolling strip that visualises rhythm
pattern slots as note blocks, with a moving beat indicator and hit/miss feedback.

### Usage

```js
var ns = new NotationStrip(containerEl, {
  beatClock: myBeatClock,       // for beat tracking animation
  judge: myJudge,               // optional: auto-hooks into judge.onResult
  bpm: 80,                      // optional BPM override
  onStateChange: function (oldState, newState) { /* ... */ },
});
ns.render();

// Set the pattern to display
ns.setPattern(pattern);

// Start beat tracking animation
ns.start();

// Pattern results are processed automatically if judge is provided,
// or can be called manually:
ns.handlePatternResult(patternResult);

ns.stop();   // Stop animation, return to idle
ns.reset();  // Clear all state and return to idle
ns.destroy(); // Cleanup
```

### States

| State     | Description                              |
|-----------|------------------------------------------|
| `idle`    | Resting state, indicator hidden          |
| `playing` | Beat indicator animating across the strip|
| `done`    | Pattern complete, hit markers visible    |

### Grade visual mapping

| Grade        | Marker colour | Symbol | CSS class                  |
|--------------|---------------|--------|----------------------------|
| `perfect`    | Green         | checkmark | `--hit-marker--perfect`  |
| `good`       | Amber         | dot       | `--hit-marker--good`     |
| `miss`       | Red           | X         | `--hit-marker--miss`     |
| `miss-extra` | Grey/dashed   | minus     | `--hit-marker--miss-extra`|

### CSS classes

All classes prefixed with `bc-game-root__`:
- `.bc-game-root__notation-strip` — root container
- `.bc-game-root__notation-strip--idle` / `--playing` / `--done` — state classes
- `.bc-game-root__notation-track` — horizontal track area
- `.bc-game-root__notation-slot` — individual pattern slot (absolute-positioned)
- `.bc-game-root__notation-slot--onset` / `--rest` — slot type
- `.bc-game-root__notation-onset-marker` — onset dot (blue circle)
- `.bc-game-root__notation-indicator` — moving beat indicator (red line with arrow)
- `.bc-game-root__notation-beat-label` — current beat number below track
- `.bc-game-root__notation-hit-marker` — hit feedback marker (with `--perfect`/`--good`/`--miss`/`--miss-extra`)
- `.bc-game-root__notation-label` — hidden aria-live label

### DOM structure

```html
<div class="bc-game-root__notation-strip bc-game-root__notation-strip--playing">
  <div class="bc-game-root__notation-label" aria-live="polite">Playing</div>
  <div class="bc-game-root__notation-track">
    <div class="bc-game-root__notation-slot bc-game-root__notation-slot--onset"
         style="left: 0%; width: 25%;">
    </div>
    <div class="bc-game-root__notation-onset-marker" style="left: 0%;"></div>
    <div class="bc-game-root__notation-onset-marker" style="left: 12.5%;"></div>
    <div class="bc-game-root__notation-slot bc-game-root__notation-slot--rest"
         style="left: 25%; width: 25%;">
    </div>
    <div class="bc-game-root__notation-indicator" style="left: 50%;"></div>
    <div class="bc-game-root__notation-hit-marker bc-game-root__notation-hit-marker--perfect"
         style="left: 0%;">✓</div>
    <div class="bc-game-root__notation-hit-marker bc-game-root__notation-hit-marker--good"
         style="left: 25%;">●</div>
  </div>
  <div class="bc-game-root__notation-beat-label">Beat 3</div>
</div>
```

## Dev Agent Record

- **Agent:** Claude Code (DeepSeek v4 Flash)
- **Date:** 2026-07-12
- **Task:** Implement Notation Strip per AD-11, NFR-20
- **Approach:** Followed existing IIFE + window namespace pattern. Uses proportional-width absolute-positioned slot blocks for pattern visualisation. Beat indicator driven by requestAnimationFrame polling beatClock. Hit feedback rendered as colour-coded markers with pop-in animation. Judge integration via `_onResult` chain-wrapping (same pattern as CatExpressions).

## File List

- `src/notation-strip.js` — NotationStrip class implementation
- `styles.css` — CSS additions for notation strip (appended, ~180 lines)
- `test/notation-strip.test.js` — comprehensive test suite (11 describe blocks, 70+ tests)
- `docs/implementation-artifacts/3-3-notation-strip.md` — this file

## Change Log

| Date       | Change                             |
|------------|-------------------------------------|
| 2026-07-12 | Initial implementation (all tasks)  |

## ADRs

- **Slot layout:** Absolute positioning with percentage-based left/width enables responsive scaling without hardcoded pixel values.
- **Beat animation:** requestAnimationFrame polling beatClock.beatTime() rather than scheduling discrete position updates. Simpler to implement and naturally handles varying frame rates. 0.08s CSS transition on indicator smooths sub-frame movement.
- **Hit feedback positioning:** Perfect/good/miss position at `onsetBeatTime` (the expected position). Extra onsets position at `playerBeatTime` since they have no expected position.