---
baseline_commit: 6dd627fcda5f96089112bd65434e334a4f288a58
---

# 3-1 Cat Metronome Demo

- **Status:** review
- **Module:** `src/cat-demo.js`
- **Export:** `window.feedBackMinigamesCatDemo.CatDemo`

## Tasks

- [x] Create `src/cat-demo.js` with CatDemo class (IIFE pattern, same as other modules)
- [x] Expose as `window.feedBackMinigamesCatDemo.CatDemo`
- [x] States: `idle`, `counting-in`, `playing`, `done`
- [x] Accept `beatClock` and schedule beats via `beatClock.scheduleAtBeat`
- [x] Metronome click via Web Audio API (short oscillator click)
- [x] Paw animation (alternating left/right on each beat)
- [x] CSS scoped under `.bc-game-root`
- [x] Write comprehensive test suite at `test/cat-demo.test.js`
- [x] Beat count display (1-indexed, updated on each beat)
- [x] aria-live label for accessibility

## Description

The CatDemo class renders a CSS cat-sprite with bongo drums and animates
paw hits synchronised to the beat clock. During the count-in and demo
phases it plays a short metronome click through the Web Audio API.

### Usage

```js
var demo = new CatDemo(containerEl, {
  beatClock: myBeatClock,
  bpm: 80,
  countInBeats: 4,
  demoBeats: 4,
  onStateChange: function (oldState, newState) { /* ... */ },
});
demo.render();
demo.start();   // transitions: idle -> counting-in -> playing -> done
demo.stop();    // returns to idle
demo.reset();   // alias for stop
demo.destroy(); // cleans up DOM and references
```

### States

| State        | Label       | Behaviour              |
|--------------|-------------|------------------------|
| `idle`       | (empty)     | Static cat, no drums   |
| `counting-in`| Get Ready!  | Metronome + paw hits   |
| `playing`    | Go!         | Metronome + paw hits   |
| `done`       | Nice!       | Animation stops        |

### CSS classes

All classes prefixed with `bc-game-root__cat-demo`:
- `.bc-game-root__cat-demo` — root container
- `.bc-game-root__cat-demo--idle` / `--counting-in` / `--playing` / `--done` — state classes
- `.bc-game-root__cat-demo-label` — state label (aria-live)
- `.bc-game-root__cat-demo-head` — cat head
- `.bc-game-root__cat-demo-ear` — cat ears (--left / --right)
- `.bc-game-root__cat-demo-face` — face features container
- `.bc-game-root__cat-demo-eye` — cat eyes
- `.bc-game-root__cat-demo-nose` — nose
- `.bc-game-root__cat-demo-mouth` — mouth
- `.bc-game-root__cat-demo-paw` — paw elements (--left / --right / --hit)
- `.bc-game-root__cat-demo-drum` — drum elements (--left / --right)
- `.bc-game-root__cat-demo-beat-count` — beat number display

## Dev Agent Record

- **Agent:** Claude Code (DeepSeek v4 Flash)
- **Date:** 2026-07-12
- **Task:** Implement Cat Metronome Demo per AD-7 / NFR-13
- **Approach:** Followed existing IIFE + window namespace pattern. Created minimal CSS cat sprite with alternating paw animation. Metronome click uses Web Audio oscillator for a short percussive tone.

## File List

- `src/cat-demo.js` — CatDemo class implementation
- `styles.css` — CSS additions for cat demo (appended, ~180 lines)
- `test/cat-demo.test.js` — comprehensive test suite (12 describe blocks, ~330 lines)
- `docs/implementation-artifacts/3-1-cat-metronome-demo.md` — this file

## Change Log

| Date       | Change                             |
|------------|-------------------------------------|
| 2026-07-12 | Initial implementation (all tasks)  |