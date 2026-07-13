---
baseline_commit: 6dd627fcda5f96089112bd65434e334a4f288a58
---

# 3-2 Cat Expressions

- **Status:** review
- **Module:** `src/cat-expressions.js`
- **Export:** `window.feedBackMinigamesCatExpressions.CatExpressions`

## Tasks

- [x] Create `src/cat-expressions.js` with CatExpressions class (IIFE pattern, same as other modules)
- [x] Expose as `window.feedBackMinigamesCatExpressions.CatExpressions`
- [x] States: `idle`, `focusing`, `happy`, `good`, `sad`
- [x] Expression enum exposed as `CatExpressions.EXPRESSION`
- [x] Emoji/text face representations per state
- [x] `handleGrade(grade)` — maps "perfect" -> happy, "good" -> good, "miss"/"miss-extra" -> sad
- [x] `handlePatternResult(patternResult)` — examines grades array, picks most negative grade
- [x] `setExpression(expr)` — direct expression setter with callback
- [x] `getExpression()` — returns current expression state
- [x] `focus()` — sets to focusing (called when gameplay starts)
- [x] `reset()` — returns to idle
- [x] `destroy()` — cleans up DOM, timers, judge hook
- [x] Auto-revert from grade-triggered expressions back to focusing after configurable delay
- [x] Judge integration: hooks into judge's `_onResult` callback, preserving existing chain
- [x] CSS scoped under `.bc-game-root` with state classes
- [x] aria-live label for accessibility
- [x] Write comprehensive test suite at `test/cat-expressions.test.js`

## Description

The CatExpressions class renders a simple emoji/text cat face that reacts to
Judge grade events. It manages five expression states and transitions between
them based on gameplay events.

### Usage

```js
var expr = new CatExpressions(containerEl, {
  judge: myJudge,            // optional: auto-hooks into judge.onResult
  autoRevertMs: 600,          // delay before reverting to focusing (default)
  onExpressionChange: function (oldExpr, newExpr) { /* ... */ },
});
expr.render();
expr.focus();   // set to focusing when gameplay starts
// Grades are handled automatically if judge is provided,
// or can be called manually:
expr.handleGrade("perfect");  // -> happy
expr.handleGrade("good");     // -> good
expr.handleGrade("miss");     // -> sad
expr.handlePatternResult(result); // process full patternResult
expr.reset();  // return to idle
expr.destroy(); // cleanup
```

### States

| State     | Face      | Description                  |
|-----------|-----------|------------------------------|
| `idle`    | ( o.o )   | Resting, neutral expression  |
| `focusing`| ( >.< )   | Alert during gameplay        |
| `happy`   | ( ^.^ )   | Perfect hit                  |
| `good`    | ( ~.~ )   | Good hit                     |
| `sad`     | ( ;.; )   | Miss                         |

### Grade mapping

| Grade        | Expression | Behaviour              |
|--------------|------------|------------------------|
| `perfect`    | happy      | Green color, scale up  |
| `good`       | good       | Blue color, slight scale|
| `miss`       | sad        | Red color, scale down  |
| `miss-extra` | sad        | Same as miss           |

### CSS classes

All classes prefixed with `bc-game-root__cat-expressions`:
- `.bc-game-root__cat-expressions` — root container
- `.bc-game-root__cat-expressions--idle` / `--focusing` / `--happy` / `--good` / `--sad` — state classes
- `.bc-game-root__cat-expressions-face` — face display element (emoji/text)
- `.bc-game-root__cat-expressions-label` — hidden aria-live label

## Dev Agent Record

- **Agent:** Claude Code (DeepSeek v4 Flash)
- **Date:** 2026-07-12
- **Task:** Implement Cat Expressions per AD-3, AD-5, AD-9, NFR-2
- **Approach:** Followed existing IIFE + window namespace pattern. Uses emoji/text face representations (no image assets needed). Integrates with Judge by wrapping the existing `_onResult` callback to preserve any pre-existing chain. Auto-revert timer ensures the face returns to focusing after a grade reaction.

## File List

- `src/cat-expressions.js` — CatExpressions class implementation
- `styles.css` — CSS additions for cat expressions (appended, ~90 lines)
- `test/cat-expressions.test.js` — comprehensive test suite (10 describe blocks, 51 tests)
- `docs/implementation-artifacts/3-2-cat-expressions.md` — this file

## Change Log

| Date       | Change                             |
|------------|-------------------------------------|
| 2026-07-12 | Initial implementation (all tasks)  |