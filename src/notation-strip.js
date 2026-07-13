// Bongo Cat's Rhythm Trainer — Notation Strip (AD-11, NFR-20)
// Sticker-arcade notation per the UX mockup: the current bar renders as a
// row of musical figures (quarter / beamed eighths / beamed sixteenths /
// rests) with a grade badge under every slot; the next bar previews dimmed
// below. The active slot is outlined and follows the beat clock.

(function () {
  "use strict";

  var T =
    window.feedBackMinigamesTunables &&
    window.feedBackMinigamesTunables.T;

  var BAR_BEATS = (T && T.BAR_LENGTH_BEATS) || 4;

  var STATE = {
    IDLE: "idle",
    PLAYING: "playing",
    DONE: "done",
  };

  var STATE_LABEL = {
    idle: "",
    playing: "Playing",
    done: "Complete",
  };

  // ---------------------------------------------------------------------------
  // Figure builders — inline SVG, conventional engraving: oval noteheads
  // with a slight tilt, straight stems, horizontal beams, standard rest
  // glyph shapes. One builder per Slot Vocabulary entry.
  // ---------------------------------------------------------------------------

  function el(cls, parent) {
    var d = document.createElement("div");
    d.className = cls;
    if (parent) parent.appendChild(d);
    return d;
  }

  // A notehead at (cx, cy): standard oval with the conventional slight tilt.
  function nh(cx, cy) {
    return '<ellipse cx="' + cx + '" cy="' + cy + '" rx="5.4" ry="3.8" ' +
      'transform="rotate(-18 ' + cx + " " + cy + ')"/>';
  }

  // A stem rising from the right edge of a notehead at (cx, cy) up to topY.
  function stem(cx, cy, topY) {
    var x = cx + 4.4;
    return '<rect x="' + x + '" y="' + topY + '" width="1.7" height="' + (cy - topY) + '" rx="0.8"/>';
  }

  function beam(x1, x2, y, h) {
    return '<rect x="' + x1 + '" y="' + y + '" width="' + (x2 - x1) + '" height="' + h + '" rx="1"/>';
  }

  function svgWrap(cls, w, h, inner) {
    return '<svg class="' + cls + '" viewBox="0 0 ' + w + " " + h + '" ' +
      'width="' + w + '" height="' + h + '" fill="currentColor" ' +
      'xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' + inner + "</svg>";
  }

  function figureQuarter(fig) {
    // Larger head, stem ending flush with the head's right shoulder.
    var inner =
      '<ellipse cx="7" cy="30.5" rx="5.9" ry="4.3" transform="rotate(-20 7 30.5)"/>' +
      '<rect x="11.5" y="4" width="1.8" height="26" rx="0.9"/>';
    fig.innerHTML = svgWrap("bc-game-root__fig-qnote", 16, 36, inner);
  }

  function figureEighths(fig) {
    var inner =
      nh(7, 31) + nh(25, 31) +
      stem(7, 31, 4) + stem(25, 31, 4) +
      beam(11.4, 31.1, 4, 3.4);
    fig.innerHTML = svgWrap("bc-game-root__fig-beamed bc-game-root__fig-beamed--e", 34, 36, inner);
  }

  function figureSixteenths(fig) {
    var xs = [7, 20, 33, 46];
    var inner = "";
    for (var i = 0; i < 4; i++) {
      inner += nh(xs[i], 31) + stem(xs[i], 31, 4);
    }
    inner += beam(11.4, 52.1, 4, 3) + beam(11.4, 52.1, 9, 3);
    fig.innerHTML = svgWrap("bc-game-root__fig-beamed bc-game-root__fig-beamed--s", 55, 36, inner);
  }

  function figureTriplet(fig) {
    var xs = [7, 22, 37];
    var inner =
      '<text class="bc-game-root__fig-triplet-label" x="24" y="8" ' +
      'text-anchor="middle" font-size="9" font-style="italic" font-weight="800">3</text>';
    for (var i = 0; i < 3; i++) {
      inner += nh(xs[i], 33) + stem(xs[i], 33, 11);
    }
    inner += beam(11.4, 43.1, 11, 3.2);
    fig.innerHTML = svgWrap("bc-game-root__fig-beamed bc-game-root__fig-beamed--t", 46, 40, inner);
  }

  function figureEighthRest(fig) {
    // Standard eighth rest: filled dot, arc sweeping right, slanted stem
    // dropping back to the left.
    var inner =
      '<circle cx="5" cy="10.5" r="3"/>' +
      '<path d="M5.5 12.8 Q9.5 15.6 13 10.4" fill="none" ' +
      'stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>' +
      '<path d="M13 10.4 L8.2 30.5" fill="none" ' +
      'stroke="currentColor" stroke-width="2" stroke-linecap="round"/>';
    fig.innerHTML = svgWrap("bc-game-root__fig-rest8", 17, 34, inner);
  }

  function figureQuarterRest(fig) {
    // Standard quarter rest: thick zigzag stroke with a comma hook at the
    // bottom — stroked, not filled, so the silhouette stays crisp small.
    var inner =
      '<path d="M6 3.5 L12 11 L7 16.5 L12.5 22.5" fill="none" ' +
      'stroke="currentColor" stroke-width="3.4" ' +
      'stroke-linejoin="round" stroke-linecap="round"/>' +
      '<path d="M12.5 22.5 Q5 21.8 6.8 29.8" fill="none" ' +
      'stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>';
    fig.innerHTML = svgWrap("bc-game-root__fig-restq", 17, 34, inner);
  }

  function buildFigure(slot, container) {
    var fig = el("bc-game-root__notation-figure", container);
    if (slot.type === "rest") {
      if (slot.duration <= 0.5) figureEighthRest(fig);
      else figureQuarterRest(fig);
    } else if (slot.onsetCount >= 4) {
      figureSixteenths(fig);
    } else if (slot.onsetCount === 3) {
      figureTriplet(fig);
    } else if (slot.onsetCount === 2) {
      figureEighths(fig);
    } else {
      figureQuarter(fig);
    }
    return fig;
  }

  // ---------------------------------------------------------------------------
  // Grade badge config (DESIGN.md: icon + text label, never color alone)
  // ---------------------------------------------------------------------------

  var BADGE = {
    perfect: { cls: "perfect", icon: "✓", label: "PERFECT" },
    good:    { cls: "good",    icon: "↑", label: "GOOD" },
    late:    { cls: "late",    icon: "↓", label: "LATE" },
    miss:    { cls: "miss",    icon: "✕", label: "MISS" },
  };

  // ---------------------------------------------------------------------------
  // NotationStrip
  // ---------------------------------------------------------------------------

  function NotationStrip(container, opts) {
    opts = opts || {};
    if (!container) throw new Error("NotationStrip requires a container element");

    this._container = container;
    this._beatClock = opts.beatClock || null;
    this._judge = opts.judge || null;
    this._bpm = opts.bpm || (T ? T.BPM_DEFAULT_LEARNING : 80);
    this._onStateChange = opts.onStateChange || null;
    this._runLabel = opts.runLabel || "";

    this._state = STATE.IDLE;
    this._pattern = null;
    this._patternResult = null;
    this._animationId = null;
    this._activeSlotIdx = -1;
    this._untilBeat = null;

    this._el = null;
    this._labelEl = null;
    this._ribbonEl = null;
    this._runlineEl = null;

    // Bar window: [{ pattern, el, slotEls, badgeEls, slotOnsets }] in ribbon
    // order; _currentIdx points at the bar being played. Bars before it are
    // graded "past" bars kept on screen until their row scrolls away.
    this._bars = [];
    this._currentIdx = -1;
    this._paging = false;

    // Bound to the CURRENT bar's record (grade/active-slot targets).
    this._slotEls = [];
    this._badgeEls = [];
    this._slotOnsets = [];

    if (this._judge) {
      this._hookJudge();
    }
  }

  function patternKey(p) {
    return p ? p.seed + ":" + p.difficulty : "";
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  NotationStrip.prototype.render = function () {
    if (this._el) return;
    this._buildDOM();
    this._container.appendChild(this._el);
  };

  /**
   * Set the current pattern and optional upcoming pattern(s), rendered as
   * dimmed preview bars. Accepts a single pattern or an array.
   */
  NotationStrip.prototype.setPattern = function (pattern, nextPatterns) {
    if (!pattern || !pattern.slots || !pattern.expectedOnsets) {
      return;
    }
    var previews;
    if (!nextPatterns) {
      previews = [];
    } else if (Array.isArray(nextPatterns)) {
      previews = nextPatterns.filter(function (p) {
        return p && p.slots && p.expectedOnsets;
      });
    } else {
      previews = [nextPatterns];
    }

    this._pattern = pattern;
    this._patternResult = null;
    this._activeSlotIdx = -1;

    var cur = this._bars[this._currentIdx];
    var next = this._bars[this._currentIdx + 1];
    if (next && patternKey(next.pattern) === patternKey(pattern)) {
      // The played bar is the on-screen "next" bar — walk the marker
      // forward instead of rebuilding, paging the row away if exhausted.
      this._advanceTo(previews);
    } else if (cur && patternKey(cur.pattern) === patternKey(pattern)) {
      // Same current bar (count-in → first cycle) — refresh previews only.
      this._replacePreviews(previews);
    } else {
      this._rebuildBars(pattern, previews);
    }
  };

  NotationStrip.prototype.setRunLabel = function (label) {
    this._runLabel = label || "";
    if (this._runlineEl) this._runlineEl.textContent = this._runLabel;
  };

  /**
   * Arm the active-slot tracker. `untilBeat` (absolute) marks the end of
   * the cycle's playable span: past it the highlight CLEARS instead of
   * wrapping back to slot 0 — grading (which advances the bar) runs a
   * fraction after the next downbeat, and without the boundary the %4
   * wrap re-highlighted the old bar's first slot in that window.
   */
  NotationStrip.prototype.start = function (untilBeat) {
    // Restartable from idle AND done — each cycle re-arms the tracker
    // after the previous bar's grade parked the strip in "done". A bare
    // start() while already playing must NOT clobber the boundary.
    if (this._state === STATE.PLAYING) return;
    if (!this._beatClock) return;
    this._untilBeat = (typeof untilBeat === "number") ? untilBeat : null;
    this._transition(STATE.PLAYING);
    this._startAnimation();
  };

  NotationStrip.prototype.stop = function () {
    this._cancelAnimation();
    this._setActiveSlot(-1);
    if (this._state === STATE.PLAYING) {
      this._transition(STATE.IDLE);
    }
  };

  /**
   * Apply a patternResult from the Judge: paint a grade badge under every
   * slot of the current bar.
   */
  NotationStrip.prototype.handlePatternResult = function (patternResult) {
    if (!patternResult || !patternResult.grades) return;
    this._patternResult = patternResult;
    this._renderGradeBadges(patternResult.grades);
    this._cancelAnimation();
    this._setActiveSlot(-1);
    this._transition(STATE.DONE);
  };

  NotationStrip.prototype.reset = function () {
    this._cancelAnimation();
    this._patternResult = null;
    this._activeSlotIdx = -1;
    this._clearBars();
    this._transition(STATE.IDLE);
  };

  NotationStrip.prototype.destroy = function () {
    this._cancelAnimation();
    this._unhookJudge();
    if (this._el && this._el.parentNode) {
      this._el.parentNode.removeChild(this._el);
    }
    this._container = null;
    this._el = null;
    this._labelEl = null;
    this._ribbonEl = null;
    this._viewportEl = null;
    this._runlineEl = null;
    this._bars = [];
    this._currentIdx = -1;
    this._slotEls = [];
    this._badgeEls = [];
    this._slotOnsets = [];
  };

  NotationStrip.prototype.getState = function () {
    return this._state;
  };

  // ---------------------------------------------------------------------------
  // DOM
  // ---------------------------------------------------------------------------

  NotationStrip.prototype._buildDOM = function () {
    var root = el("bc-game-root__notation-strip sticker-panel");

    var label = el("bc-game-root__notation-label", root);
    label.setAttribute("aria-live", "polite");
    this._labelEl = label;

    // Viewport wrapper: clipped to exactly two rows (measured after each
    // layout change) so a third row never spills over the cat zone — it
    // scrolls into view when the row pages up.
    var viewport = el("bc-game-root__notation-viewport", root);
    this._viewportEl = viewport;

    var ribbon = el("bc-game-root__notation-ribbon", viewport);
    this._ribbonEl = ribbon;

    // (No runline — mode/BPM live in the HUD chips; setRunLabel and
    // _updateLabelBeat no-op against the null element.)
    this._runlineEl = null;

    this._el = root;
  };

  NotationStrip.prototype._rebuildBars = function (pattern, previews) {
    this._clearBars();
    if (!this._ribbonEl) return;

    this._bars.push(this._makeBar(pattern, true));
    for (var i = 0; i < previews.length; i++) {
      this._bars.push(this._makeBar(previews[i], false));
    }
    this._currentIdx = 0;
    this._bindCurrent();
    this._clampViewport();
  };

  // Build one bar element + its record, appended to the ribbon.
  NotationStrip.prototype._makeBar = function (pattern, isCurrent) {
    var barEl = el(
      "bc-game-root__notation-bar bc-game-root__notation-bar--" +
        (isCurrent ? "current" : "next"),
      this._ribbonEl
    );
    var record = { pattern: pattern, el: barEl, slotEls: [], badgeEls: [], slotOnsets: [] };

    var beatCursor = 0;
    for (var i = 0; i < pattern.slots.length; i++) {
      var slot = pattern.slots[i];
      var slotEl = el("bc-game-root__notation-slot", barEl);
      slotEl.style.flexGrow = String(slot.duration);

      buildFigure(slot, slotEl);

      var badge = el("bc-game-root__grade bc-game-root__grade--wait", slotEl);
      badge.textContent = "·";

      record.slotEls.push(slotEl);
      record.badgeEls.push(badge);
      var onsets = [];
      if (slot.type === "onset" && slot.onsetCount > 0) {
        var spacing = slot.duration / slot.onsetCount;
        for (var j = 0; j < slot.onsetCount; j++) {
          onsets.push(beatCursor + j * spacing);
        }
      }
      record.slotOnsets.push({ start: beatCursor, end: beatCursor + slot.duration, onsets: onsets });
      beatCursor += slot.duration;
    }
    return record;
  };

  // Clamp the viewport to the height of the first two ribbon rows. Bars
  // in the third row and beyond stay in the DOM (they page into view) but
  // never overspill the panel.
  NotationStrip.prototype._clampViewport = function () {
    if (!this._viewportEl || this._bars.length === 0) {
      if (this._viewportEl) this._viewportEl.style.height = "";
      return;
    }
    var firstTop = this._bars[0].el.offsetTop;
    var row2Top = null;
    var row3Top = null;
    for (var i = 1; i < this._bars.length; i++) {
      var top = this._bars[i].el.offsetTop;
      if (row2Top === null && top > firstTop) row2Top = top;
      else if (row2Top !== null && top > row2Top) { row3Top = top; break; }
    }
    this._viewportEl.style.height = row3Top !== null
      ? (row3Top - firstTop) + "px"
      : "";
  };

  // Point the grade/active-slot machinery at the current bar's record.
  NotationStrip.prototype._bindCurrent = function () {
    var cur = this._bars[this._currentIdx];
    this._slotEls = cur ? cur.slotEls : [];
    this._badgeEls = cur ? cur.badgeEls : [];
    this._slotOnsets = cur ? cur.slotOnsets : [];
  };

  // Walk the current-marker one bar forward. Past bars keep their graded
  // badges and dim out; stale previews are replaced (a difficulty ramp may
  // have changed them); the row pages away only when exhausted.
  NotationStrip.prototype._advanceTo = function (previews) {
    var old = this._bars[this._currentIdx];
    if (old) {
      old.el.classList.remove("bc-game-root__notation-bar--current");
      old.el.classList.add("bc-game-root__notation-bar--past");
    }
    this._currentIdx++;
    var cur = this._bars[this._currentIdx];
    if (cur) {
      cur.el.classList.remove("bc-game-root__notation-bar--next");
      cur.el.classList.add("bc-game-root__notation-bar--current");
    }
    this._replacePreviews(previews);
    this._bindCurrent();
    this._maybePage();
  };

  // Drop every bar after the current one and append fresh previews.
  NotationStrip.prototype._replacePreviews = function (previews) {
    for (var i = this._bars.length - 1; i > this._currentIdx; i--) {
      var rec = this._bars[i];
      if (rec.el.parentNode) rec.el.parentNode.removeChild(rec.el);
    }
    this._bars.length = this._currentIdx + 1;
    for (var p = 0; p < previews.length; p++) {
      this._bars.push(this._makeBar(previews[p], false));
    }
    this._bindCurrent();
    this._clampViewport();
  };

  // When the current bar has left the first ribbon row, scroll the old row
  // up with the bouncy ribbon transition, then drop it and reset.
  NotationStrip.prototype._maybePage = function () {
    if (this._paging || !this._ribbonEl || this._bars.length === 0) return;
    var ribbon = this._ribbonEl;

    // Columns per row = bars sharing the first bar's offsetTop.
    var firstTop = this._bars[0].el.offsetTop;
    var cols = 0;
    for (var i = 0; i < this._bars.length; i++) {
      if (this._bars[i].el.offsetTop === firstTop) cols++;
      else break;
    }
    if (cols < 1 || this._currentIdx < cols) return;

    // Row height: next row's top minus first row's top (fallback: bar
    // height + the 6px ribbon gap).
    var rowH = this._bars[cols] ? this._bars[cols].el.offsetTop - firstTop
      : this._bars[0].el.offsetHeight + 6;

    var self = this;
    this._paging = true;
    ribbon.style.transform = "translateY(-" + rowH + "px)";
    setTimeout(function () {
      // Drop the scrolled-away row and snap back without a transition.
      for (var r = 0; r < cols; r++) {
        var rec = self._bars[r];
        if (rec && rec.el.parentNode) rec.el.parentNode.removeChild(rec.el);
      }
      self._bars.splice(0, cols);
      self._currentIdx -= cols;
      ribbon.style.transition = "none";
      ribbon.style.transform = "";
      void ribbon.offsetHeight; // force reflow so the reset isn't animated
      ribbon.style.transition = "";
      self._paging = false;
      self._clampViewport();
    }, 380);
  };

  NotationStrip.prototype._clearBars = function () {
    if (this._ribbonEl) {
      this._ribbonEl.innerHTML = "";
      this._ribbonEl.style.transform = "";
    }
    this._bars = [];
    this._currentIdx = -1;
    this._paging = false;
    this._slotEls = [];
    this._badgeEls = [];
    this._slotOnsets = [];
  };

  // ---------------------------------------------------------------------------
  // Grade badges — worst grade of the slot's onsets wins; Good carries an
  // early/late direction (CAP-4), late shown in the amber LATE badge.
  // ---------------------------------------------------------------------------

  NotationStrip.prototype._renderGradeBadges = function (grades) {
    var msPerBeat = 60000 / this._bpm;

    for (var s = 0; s < this._slotOnsets.length; s++) {
      var info = this._slotOnsets[s];
      var badge = this._badgeEls[s];
      if (!badge || info.onsets.length === 0) continue; // rests keep the wait dot

      // Collect grades whose expected onset falls inside this slot.
      var slotGrades = [];
      for (var g = 0; g < grades.length; g++) {
        var grade = grades[g];
        if (grade.onsetBeatTime === null) continue; // extras have no slot
        if (grade.onsetBeatTime >= info.start - 1e-6 && grade.onsetBeatTime < info.end - 1e-6) {
          slotGrades.push(grade);
        }
      }
      if (!slotGrades.length) continue;

      // Worst grade wins: miss > late > good > perfect.
      var chosen = null;
      var rank = { miss: 3, late: 2, good: 1, perfect: 0 };
      for (var k = 0; k < slotGrades.length; k++) {
        var cur = slotGrades[k];
        var key = cur.grade;
        var deltaMs = 0;
        if (key === "good" && cur.playerBeatTime !== null) {
          deltaMs = (cur.playerBeatTime - cur.onsetBeatTime) * msPerBeat;
          if (deltaMs > 0) key = "late";
        }
        if (key === "miss-extra") key = "miss";
        if (!chosen || rank[key] > rank[chosen.key]) {
          chosen = { key: key, deltaMs: deltaMs };
        }
      }

      this._paintBadge(s, chosen.key, chosen.deltaMs);
    }
  };

  /**
   * Paint one slot's grade badge. Used by both the authoritative bar-end
   * pass and the live per-onset path.
   */
  NotationStrip.prototype._paintBadge = function (slotIdx, key, deltaMs) {
    var badge = this._badgeEls[slotIdx];
    if (!badge) return;
    var cfg = BADGE[key] || BADGE.miss;
    badge.className = "bc-game-root__grade bc-game-root__grade--" + cfg.cls;
    badge.textContent = "";
    var icon = document.createElement("span");
    icon.className = "bc-game-root__grade-icon";
    icon.textContent = cfg.icon + " ";
    badge.appendChild(icon);
    badge.appendChild(document.createTextNode(cfg.label));
    if (key === "late" || key === "good") {
      var ms = document.createElement("small");
      var v = Math.round(deltaMs || 0);
      ms.textContent = " " + (v > 0 ? "+" : "−") + Math.abs(v) + "ms";
      badge.appendChild(ms);
    }
  };

  /**
   * Immediate per-onset feedback: paint the badge of the slot owning
   * `onsetBeatTime` as soon as the hit is judged, without waiting for the
   * bar-end patternResult (which later repaints authoritatively and adds
   * the misses).
   */
  NotationStrip.prototype.showLiveGrade = function (onsetBeatTime, key, deltaMs) {
    for (var s = 0; s < this._slotOnsets.length; s++) {
      var info = this._slotOnsets[s];
      if (onsetBeatTime >= info.start - 1e-6 && onsetBeatTime < info.end - 1e-6) {
        this._paintBadge(s, key, deltaMs);
        return;
      }
    }
  };

  // ---------------------------------------------------------------------------
  // Active-slot tracking on the beat clock
  // ---------------------------------------------------------------------------

  NotationStrip.prototype._startAnimation = function () {
    var self = this;
    this._cancelAnimation();

    function tick() {
      if (self._state !== STATE.PLAYING) return;

      var beatTime = 0;
      if (self._beatClock && typeof self._beatClock.beatTime === "function") {
        beatTime = self._beatClock.beatTime();
      }
      if (self._untilBeat !== null && beatTime >= self._untilBeat) {
        // Cycle's playable span is over — clear rather than wrap to slot 0.
        self._setActiveSlot(-1);
        self._animationId = requestAnimationFrame(tick);
        return;
      }
      var barBeat = Math.min(beatTime % BAR_BEATS, BAR_BEATS);

      // Highlight the slot the playhead is inside.
      var active = -1;
      for (var i = 0; i < self._slotOnsets.length; i++) {
        if (barBeat >= self._slotOnsets[i].start && barBeat < self._slotOnsets[i].end) {
          active = i;
          break;
        }
      }
      self._setActiveSlot(active);
      self._updateLabelBeat(barBeat);

      self._animationId = requestAnimationFrame(tick);
    }

    this._animationId = requestAnimationFrame(tick);
  };

  NotationStrip.prototype._cancelAnimation = function () {
    if (this._animationId) {
      cancelAnimationFrame(this._animationId);
      this._animationId = null;
    }
  };

  NotationStrip.prototype._setActiveSlot = function (idx) {
    if (idx === this._activeSlotIdx) return;
    if (this._activeSlotIdx >= 0 && this._slotEls[this._activeSlotIdx]) {
      this._slotEls[this._activeSlotIdx].classList.remove("bc-game-root__notation-slot--active");
    }
    if (idx >= 0 && this._slotEls[idx]) {
      this._slotEls[idx].classList.add("bc-game-root__notation-slot--active");
    }
    this._activeSlotIdx = idx;
  };

  NotationStrip.prototype._updateLabelBeat = function (barBeat) {
    if (this._runlineEl && this._runLabel) {
      var beatNum = Math.min(BAR_BEATS, Math.floor(barBeat) + 1);
      this._runlineEl.textContent =
        this._runLabel + " — beat " + beatNum + " of " + BAR_BEATS;
    }
  };

  // ---------------------------------------------------------------------------
  // Judge integration
  // ---------------------------------------------------------------------------

  NotationStrip.prototype._hookJudge = function () {
    if (!this._judge) return;

    var self = this;

    // Wrap the existing onResult callback so we don't overwrite it
    var existingOnResult = null;
    if (typeof this._judge._onResult === "function") {
      existingOnResult = this._judge._onResult;
    }

    this._judge._onResult = function (result) {
      self.handlePatternResult(result);
      if (typeof existingOnResult === "function") {
        existingOnResult(result);
      }
    };
  };

  NotationStrip.prototype._unhookJudge = function () {
    // Cleanup handled by destroy lifecycle.
  };

  // ---------------------------------------------------------------------------
  // State management
  // ---------------------------------------------------------------------------

  NotationStrip.prototype._transition = function (newState) {
    var oldState = this._state;
    this._state = newState;
    if (this._labelEl) {
      this._labelEl.textContent = STATE_LABEL[newState] || "";
    }
    if (this._el) {
      this._el.className = "bc-game-root__notation-strip sticker-panel";
      if (newState !== STATE.IDLE) {
        this._el.classList.add("bc-game-root__notation-strip--" + newState);
      }
    }
    if (typeof this._onStateChange === "function") {
      this._onStateChange(oldState, newState);
    }
  };

  NotationStrip.STATE = STATE;

  if (typeof window.feedBackMinigamesNotationStrip === "undefined") {
    window.feedBackMinigamesNotationStrip = {};
  }
  window.feedBackMinigamesNotationStrip.NotationStrip = NotationStrip;
})();
