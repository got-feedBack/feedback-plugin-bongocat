---
baseline_commit: 6dd627fcda5f96089112bd65434e334a4f288a58
---

# 4-2 Run History

- **Status:** review
- **Module:** `src/run-history.js`
- **Export:** `window.feedBackMinigamesRunHistory.RunHistory`

## Tasks

- [x] Create `src/run-history.js` with RunHistory class (IIFE pattern, same as other modules)
- [x] Expose as `window.feedBackMinigamesRunHistory.RunHistory`
- [x] `saveRun(runData, cb)` — POST `/api/plugins/feedback-plugin-bongocat/runs` with Content-Type application/json
- [x] `fetchLatest(cb)` — GET `/api/plugins/feedback-plugin-bongocat/runs/latest?user_id=<id>`
- [x] Resolves user ID from SDK `getProfile()` — calls once, caches result
- [x] `clearCache()` — forces a fresh profile lookup on next call
- [x] 201 response on saveRun calls back with null error
- [x] 200 response on fetchLatest calls back with parsed run object
- [x] 204 response on fetchLatest calls back with null run (no runs yet)
- [x] Non-2xx status codes call back with an error
- [x] Network errors call back with an error
- [x] Malformed JSON on fetchLatest calls back with parse error
- [x] Missing SDK or null SDK throws on construction
- [x] Null/undefined runData calls back with an error
- [x] Omitting callback does not throw
- [x] getProfile rejection calls back with an error
- [x] getProfile returns profile without id calls back with an error
- [x] Write comprehensive test suite at `test/run-history.test.js` (mock XHR)

## Description

The RunHistory class provides a clean abstraction for persisting and retrieving
completed rhythm-game runs via the plugin's routes.py REST API. It is consumed
by the HubTile component to display a last-run summary on the hub dashboard.

### Usage

```js
var rh = new RunHistory(sdk);

// Persist a completed run
rh.saveRun({
  score: 8750,
  mode: "challenge",
  bpm: 140,
  duration_ms: 45000,
  patterns_survived: 18,
  avg_timing_error_ms: 12.3,
  summary_html: "3 patterns",
}, function (err) {
  if (err) console.error("Save failed", err);
});

// Fetch the latest run for the hub tile
rh.fetchLatest(function (err, run) {
  if (err) {
    // Handle error
  } else if (run) {
    // Render: run.mode, run.bpm, run.summary_html, etc.
  } else {
    // No runs yet — show "No runs yet"
  }
});

rh.clearCache(); // Force fresh profile fetch on next call
```

### API contract

| Method                           | HTTP call                                  | Success callback            |
|----------------------------------|--------------------------------------------|-----------------------------|
| `saveRun(runData, cb)`           | POST `/runs` with JSON body                | `cb(null)`                  |
| `fetchLatest(cb)`                | GET `/runs/latest?user_id=<id>`            | `cb(null, run)` or `cb(null, null)` |

The `run` object returned by `fetchLatest` contains the fields from the `runs`
table: `instrument`, `mode`, `bpm`, `score`, `duration_ms`,
`avg_timing_error_ms`, `patterns_survived`, `summary_html`, `created_at`.

### HubTile integration

The `fetchLatest` method is the primary integration point for HubTile. The
hub-tile component calls `fetchLatest` during render to populate the summary
line with the most recent run's mode, BPM, and optional summary HTML.

```js
// In HubTile.render():
var rh = new RunHistory(sdk);
rh.fetchLatest(function (err, lastRun) {
  self._container.innerHTML = buildTileHtml(lastRun);
});
```

### Error handling

All errors flow through the callback as the first argument (Node-style). The
second argument is only populated on success. Error types:

- **Construction:** `new RunHistory()` without an SDK throws immediately
- **Profile errors:** SDK rejection or missing user ID → descriptive error message
- **Save errors:** network failure, non-201 response → error message with status
- **Fetch errors:** network failure, non-200/204 response, parse failure → error message
- **No runs yet:** 204 response → `cb(null, null)` — not an error, but no data

### User ID caching

The resolved user ID is cached after the first successful `getProfile()` call.
This avoids redundant profile lookups when both `saveRun` and `fetchLatest` are
called in sequence. Call `clearCache()` to invalidate the cache (useful for
testing or when the user context changes).

## Dev Agent Record

- **Agent:** Claude Code (DeepSeek v4 Flash)
- **Date:** 2026-07-12
- **Task:** Implement RunHistory per hub-tile data requirements
- **Approach:** Followed existing IIFE + window namespace pattern. XHR is used
  directly (no fetch polyfill) to match the existing hub-tile.js pattern. The
  callback idiom mirrors the existing `fetchLastRun` function shape in hub-tile,
  so integration is a drop-in replacement. User ID resolution is deferred to the
  SDK and cached to avoid redundant calls. Mock XHR in tests avoids network
  dependencies and follows the existing pattern of using `vi.stubGlobal`.

## File List

- `src/run-history.js` — RunHistory class implementation
- `test/run-history.test.js` — comprehensive test suite (7 describe blocks, 28 tests)
- `docs/implementation-artifacts/4-2-run-history.md` — this file

## Change Log

| Date       | Change                             |
|------------|-------------------------------------|
| 2026-07-12 | Initial implementation (all tasks)  |

## ADRs

- **Mock XHR over fetch:** The existing codebase uses XMLHttpRequest (hub-tile.js
  `fetchLastRun`). Using XHR for RunHistory maintains consistency and avoids
  introducing a polyfill dependency. Tests mock XMLHttpRequest with `vi.stubGlobal`
  to verify the wire format without a server.
- **Callback idiom:** Node-style callbacks (`cb(err, result)`) were chosen over
  Promises to match the existing `fetchLastRun` callback pattern in hub-tile.js,
  simplifying the integration surface.
- **User ID caching:** The profile is fetched once per RunHistory instance and
  cached. This is acceptable because the user does not change during a session.
  The `clearCache()` escape hatch exists for testing and edge cases.
- **Error granularity:** Each error message includes the method name and the
  semantic failure reason (e.g. "network error", "server returned 500") so that
  callers can provide meaningful feedback without parsing opaque error codes.
- **No retry logic:** Save/fetch failures are surfaced to the caller rather than
  retried internally. The hub tile may choose to show a cached fallback rather
  than retrying, which is a presentation concern, not a data concern.