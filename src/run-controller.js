// Bongo Cat's Rhythm Trainer — Run Controller (orchestrator)
// Wires BeatClock, FSM, PatternGenerator, InputAdapter, Judge, and every UI
// component (HUD, CatDemo, CatExpressions, NotationStrip, RunSummary) into
// the actual game loop. This is the only module that owns cross-component
// sequencing; each component stays ignorant of the others.
//
// Cycle layout per pattern (beats are BeatClock-absolute; the clock is
// restarted at the top of every cycle so beat 0 = cycle start, which keeps
// CatDemo's absolute-beat scheduling valid on every cycle):
//   count-in : beats 0..COUNT_IN-1           (cat + click)
//   demo     : beats COUNT_IN..COUNT_IN+3    (learning only; cat drums along)
//   response : 4 beats — starts after demo (learning) or after count-in
//              (challenge, cat keeps drumming as a metronome)
//   grading  : response end + good-window slack → Judge → FSM → next cycle

(function () {
  "use strict";

  function deps() {
    var w = window;
    return {
      T: w.feedBackMinigamesTunables.T,
      BeatClock: w.feedBackMinigamesBeatClock.BeatClock,
      FSM: w.feedBackMinigamesFSM.FSM,
      StateContext: w.feedBackMinigamesFSM.StateContext,
      Scoring: w.feedBackMinigamesScoring.Scoring,
      PatternGenerator: w.feedBackMinigamesPatternGenerator.PatternGenerator,
      InputAdapter: w.feedBackMinigamesInputAdapter.InputAdapter,
      Judge: w.feedBackMinigamesJudge.Judge,
      HUD: w.feedBackMinigamesHUD.HUD,
      CatDemo: w.feedBackMinigamesCatDemo.CatDemo,
      CatExpressions: w.feedBackMinigamesCatExpressions.CatExpressions,
      NotationStrip: w.feedBackMinigamesNotationStrip.NotationStrip,
      RunSummary: w.feedBackMinigamesRunSummary.RunSummary,
      RunHistory: w.feedBackMinigamesRunHistory && w.feedBackMinigamesRunHistory.RunHistory,
    };
  }

  function RunController(container, opts) {
    opts = opts || {};
    if (!container) throw new Error("RunController requires a container element");

    this._container = container;
    this._config = opts.config || { instrument: "guitar", mode: "learning", bpm: 80 };
    this._sdk = opts.sdk || null;
    this._bridge = opts.noteDetectBridge || null;

    this._d = deps();

    // Cross-cycle bookkeeping
    this._gen = 0;              // generation token: invalidates stale scheduled callbacks
    this._seedCounter = (Date.now() % 100000) | 0;
    this._collecting = false;
    this._collectedOnsets = [];
    this._responseStartBeat = 0;
    this._livePattern = null;
    this._liveMatched = [];
    this._carryOnsets = [];
    this._destroyed = false;
    this._startedAt = 0;

    // Run stats for summary / persistence
    this._stats = null;

    // Component handles
    this._beatClock = null;
    this._ctx = null;
    this._fsm = null;
    this._judge = null;
    this._inputAdapter = null;
    this._hud = null;
    this._catDemo = null;
    this._catExpr = null;
    this._strip = null;
    this._summary = null;
    this._els = {};
    this._pitchHandle = null;
    this._energyStop = null;
    this._cycleCount = 0;
    this._nextCycleStart = null;
    this._catQueuedFor = null;
  }

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  RunController.prototype.start = function () {
    var self = this;
    var d = this._d;
    var config = this._config;

    this._buildDOM();
    this._startedAt = (typeof performance !== "undefined" && performance.now)
      ? performance.now() : Date.now();
    this._resetStats();

    // --- Time authority ---
    this._beatClock = new d.BeatClock();
    this._beatClock.create();

    // --- State ---
    this._ctx = new d.StateContext({
      phase: config.mode,
      startingLives: d.T.STARTING_LIVES,
    });

    var generatePattern = function (difficulty) {
      self._seedCounter += 1;
      return d.PatternGenerator.generate(difficulty, self._seedCounter).currentPattern;
    };

    this._fsm = new d.FSM(this._ctx, {
      beatClock: this._beatClock,
      generatePattern: generatePattern,
      scoring: new d.Scoring(),
      onTransition: function (oldState, newState) {
        self._onTransition(oldState, newState);
      },
    });

    // --- Judging + input ---
    this._judge = new d.Judge({ bpm: config.bpm });

    this._inputAdapter = new d.InputAdapter({
      instrument: config.instrument,
      beatClock: this._beatClock,
      bpm: config.bpm,
      noteDetectBridge: this._bridge,
      onOnset: function (onset) { self._onOnset(onset); },
    });
    if (config.instrument === "piano" || config.instrument === "drums") {
      this._inputAdapter.attachMidi();
    } else if (config.instrument === "guitar") {
      this._startGuitarListener();
    }

    // --- UI components ---
    this._hud = new d.HUD(this._els.hud, { stateContext: this._ctx, bpm: config.bpm });
    this._hud.render();

    var isChallengeMode = config.mode === "challenge";
    this._catDemo = new d.CatDemo(this._els.cat, {
      beatClock: this._beatClock,
      bpm: config.bpm,
      instrument: config.instrument,
      countInBeats: d.T.COUNT_IN_LENGTH_BEATS,
      demoBeats: d.T.BAR_LENGTH_BEATS,
      // Turn cues: in learning the cat performs first ("Listen…"), then
      // it's the player's bar; in challenge every bar is the player's.
      demoLabel: isChallengeMode ? "Your turn!" : "Listen…",
      responseLabel: "Your turn!",
      onStateChange: function (oldState, newState) {
        self._onCatDemoState(oldState, newState);
      },
    });
    this._catDemo.render();

    // NotationStrip chains onto judge._onResult internally, so a
    // gradePattern() call paints grade badges without extra wiring.
    // (CatExpressions is intentionally NOT mounted: per the UX design the
    // sprite cat itself is the emotional channel — no separate face panel.)
    this._strip = new d.NotationStrip(this._els.strip, {
      beatClock: this._beatClock,
      judge: this._judge,
      bpm: config.bpm,
      runLabel: this._runLabel(),
    });
    this._strip.render();

    // --- Kick off ---
    // AudioContext needs a resume (we're inside a click-initiated start, so
    // the gesture requirement is satisfied). FSM.startRun refuses to run
    // until the clock is actually running.
    var diag = window.bongocatDiag;
    if (diag) {
      diag.log("run.start", {
        config: config,
        noteDetectAvailable: this._bridge ? this._bridge.isAvailable() : false,
        noteDetectVersion: this._bridge ? this._bridge.getVersion() : null,
      });
    }

    this._beatClock.resume().then(function () {
      if (self._destroyed) return;
      self._beatClock.start(config.bpm);
      // Generate the run's patterns FIRST so the notation is on screen
      // through the count-in (and calibration), then 4-3-2-1, then play.
      if (!self._fsm.startRun(config.mode)) {
        console.warn("BongoCat: FSM refused to start (beat clock not running)");
        return;
      }
      self._showUpcoming();
      self._runCountIn(function () {
        self._maybeCalibrate(function () {
          if (self._destroyed) return;
          self._beginCycle();
        });
      });
    });
  };

  RunController.prototype.destroy = function () {
    this._destroyed = true;
    this._gen++;
    this._stopGuitarListener();
    if (this._inputAdapter) this._inputAdapter.detachMidi();
    if (this._catDemo) this._catDemo.destroy();
    if (this._strip) this._strip.destroy();
    if (this._hud) this._hud.destroy();
    if (this._summary) this._summary.destroy();
    if (this._beatClock) this._beatClock.destroy();
    if (this._container && this._container.firstChild) {
      this._container.innerHTML = "";
    }
    this._container = null;
  };

  // ---------------------------------------------------------------------------
  // DOM scaffold
  // ---------------------------------------------------------------------------

  RunController.prototype._buildDOM = function () {
    this._container.innerHTML = "";

    var els = this._els;
    var stage = document.createElement("div");
    stage.className = "bc-game-root__stage";

    // Mockup order: HUD row on top, tall notation area, cat + instrument
    // pinned to the bottom of the stage.
    els.hud = document.createElement("div");
    els.hud.className = "bc-game-root__stage-hud";
    stage.appendChild(els.hud);

    els.strip = document.createElement("div");
    els.strip.className = "bc-game-root__stage-strip";
    stage.appendChild(els.strip);

    els.cat = document.createElement("div");
    els.cat.className = "bc-game-root__stage-cat";
    stage.appendChild(els.cat);

    els.summary = document.createElement("div");
    els.summary.className = "bc-game-root__stage-summary";
    stage.appendChild(els.summary);

    els.calibration = document.createElement("div");
    els.calibration.className = "bc-game-root__calibration-overlay sticker-panel";
    els.calibration.style.display = "none";
    stage.appendChild(els.calibration);

    els.countdown = document.createElement("div");
    els.countdown.className = "bc-game-root__countdown";
    els.countdown.setAttribute("aria-live", "assertive");
    els.countdown.style.display = "none";
    stage.appendChild(els.countdown);

    this._container.appendChild(stage);
  };

  // ---------------------------------------------------------------------------
  // Cycle sequencing
  // ---------------------------------------------------------------------------

  // One cycle = count-in (+demo in learning) + response + grading for the
  // FSM's currentPattern. The beat clock restarts at cycle start so all
  // scheduled beats are cycle-relative.
  RunController.prototype._beginCycle = function () {
    if (this._destroyed) return;
    var d = this._d;
    var self = this;
    var gen = ++this._gen;

    var pattern = this._ctx.currentPattern;
    if (!pattern) return;

    var bar = d.T.BAR_LENGTH_BEATS;
    var isChallenge = this._config.mode === "challenge";

    // Continuous timeline: the clock is NEVER restarted between cycles —
    // restarting it inside the grading callback started each bar ~100 ms
    // late (an audible gap). Each cycle begins at an exact absolute beat:
    // chained from the previous cycle when one exists, otherwise aligned
    // to the next whole-bar boundary (post-calibration handoff).
    var start;
    if (typeof this._nextCycleStart === "number") {
      start = this._nextCycleStart;
    } else {
      var nowBeat = this._beatClock.beatTime();
      start = Math.ceil((nowBeat + 1) / bar) * bar;
    }
    // Learning cycle = demo bar + response bar; challenge = response bar.
    this._nextCycleStart = start + (isChallenge ? bar : 2 * bar);

    var responseStart = start + (isChallenge ? 0 : bar);

    // Update the strip: the strip itself decides between advancing the
    // current-marker (same row), paging the row away, or a full rebuild.
    this._strip.setPattern(pattern, this._previewPatterns());
    this._strip.setRunLabel(this._runLabel());
    // Per-slot highlight tracks the whole cycle: the cat's demo bar and
    // the player's response bar share the same figure, so one %4 tracker
    // follows both. The boundary stops it wrapping back to slot 0 in the
    // grading slack after the cycle's last beat.
    this._strip.start(responseStart + bar);

    // Cat: in learning it PERFORMS the pattern (paw taps on the actual
    // onsets) and keeps a metronome under the response window; in
    // challenge the demo bar is a plain metronome under the response.
    // The cat always performs the pattern's rhythm — during the learning
    // demo, under the learning response, and through challenge bars — so
    // the player is locking onto the actual figure, never a bare 4/4.
    //
    // AUDIO IS DECOUPLED FROM GRADING: this cycle's performance was queued
    // by the PREVIOUS cycle (the cat chained into it at the exact bar
    // boundary on the beat clock). _beginCycle runs from the grading
    // callback ~0.14 beats after the downbeat — restarting the cat here
    // was the audible inter-bar gap. Only the very first cycle (or a
    // post-summary restart) starts the cat directly.
    if (this._catQueuedFor !== start) {
      this._catDemo.stop();
      this._catDemo.setCountInBeats(0);
      this._catDemo.setPattern(pattern);
      this._catDemo.setResponseBeats(isChallenge ? 0 : bar);
      this._catDemo.start(start);
    }
    // Queue the NEXT cycle now — its pattern is already fixed (the FSM
    // moves nextPattern → current at grading and never rewrites it).
    if (this._ctx.nextPattern) {
      this._catDemo.queueNext({
        atBeat: this._nextCycleStart,
        pattern: this._ctx.nextPattern,
        responseBeats: isChallenge ? 0 : bar,
      });
      this._catQueuedFor = this._nextCycleStart;
    } else {
      this._catQueuedFor = null;
    }

    // FSM bookkeeping transitions (CountIn → Demo → Response) are driven
    // off the same absolute-beat schedule the cat animates on.
    this._fsm.completeCountIn();
    if (isChallenge) {
      this._openResponseWindow(gen, responseStart, pattern);
    } else {
      this._scheduleAt(gen, responseStart, function () {
        self._fsm.completeDemo();
        self._openResponseWindow(gen, responseStart, pattern);
      });
    }

    // Grade once the response bar plus the trailing good-window has passed.
    var goodBeats = this._beatClock.msToBeats(d.T.GOOD_OUTER_MS);
    this._scheduleAt(gen, responseStart + bar + goodBeats + 0.05, function () {
      self._gradeResponse(gen, pattern);
    });
  };

  RunController.prototype._openResponseWindow = function (gen, responseStartBeat, pattern) {
    if (gen !== this._gen || this._destroyed) return;
    this._responseStartBeat = responseStartBeat;
    this._collecting = true;

    // Adopt boundary onsets carried over from the previous bar (a downbeat
    // hit that arrived while the old window was technically still open).
    var slack = this._beatClock.msToBeats(this._d.T.GOOD_OUTER_MS);
    var carried = (this._carryOnsets || []).filter(function (o) {
      return o.beatTime >= responseStartBeat - slack;
    });
    this._carryOnsets = [];
    this._collectedOnsets = carried;
    // Live-feedback state: which expected onsets have been claimed by a
    // live-judged hit so far this window.
    this._livePattern = pattern || this._ctx.currentPattern;
    this._liveMatched = new Array(
      (this._livePattern && this._livePattern.expectedOnsets.length) || 0
    ).fill(false);

    // Live MISS feedback: each expected onset gets a check scheduled just
    // after its good-window closes (plus slack for detection latency) —
    // still unclaimed by then means the note was missed, and the slot's
    // badge flips immediately instead of waiting for the bar-end grade.
    // A late-processed hit whose backdated time still matched would simply
    // repaint the badge via _judgeLive; the bar-end pass stays
    // authoritative either way.
    var self = this;
    var goodBeats = this._beatClock.msToBeats(this._d.T.GOOD_OUTER_MS);
    var expected = (this._livePattern && this._livePattern.expectedOnsets) || [];
    // 0.3 beats of slack past the window: a maximally-late hit plus
    // detection latency must land BEFORE its miss deadline, or the badge
    // flashes MISS an instant before the hit repaints it.
    expected.forEach(function (onsetBeat, idx) {
      self._scheduleAt(gen, responseStartBeat + onsetBeat + goodBeats + 0.3, function () {
        // Once the bar is graded the authoritative badges are on screen —
        // a straggling live check must not repaint over them.
        if (!self._collecting) return;
        if (!self._liveMatched[idx]) {
          self._strip.showLiveGrade(onsetBeat, "miss", 0);
        }
      });
    });
    // Live-judge the adopted onsets so their badges appear immediately.
    for (var c = 0; c < carried.length; c++) {
      this._judgeLive(carried[c].beatTime - responseStartBeat);
    }

    var diag = window.bongocatDiag;
    if (diag) diag.log("response.open", { startBeat: responseStartBeat, carried: carried.length });
  };

  RunController.prototype._gradeResponse = function (gen, pattern) {
    if (gen !== this._gen || this._destroyed) return;
    this._collecting = false;

    // Judge expects pattern-relative beat times. Onsets past the last
    // possible hit window belong to the NEXT bar's downbeat (in challenge
    // the windows are contiguous and grading runs a fraction late) — carry
    // them over instead of grading them as extras here and losing them.
    var respStart = this._responseStartBeat;
    var goodBeats = this._beatClock.msToBeats(this._d.T.GOOD_OUTER_MS);
    // Anything later than the LAST onset's window edge can only be the
    // next bar's material.
    var exp = pattern.expectedOnsets || [];
    var lastWindowEnd = (exp.length ? exp[exp.length - 1] : 0) + goodBeats;
    var relOnsets = [];
    this._carryOnsets = [];
    for (var ci = 0; ci < this._collectedOnsets.length; ci++) {
      var o = this._collectedOnsets[ci];
      var rel = o.beatTime - respStart;
      if (rel > lastWindowEnd) {
        this._carryOnsets.push(o); // can't match any onset in THIS bar
      } else {
        relOnsets.push({
          sourceInstrument: o.sourceInstrument,
          beatTime: rel,
          timestamp: o.timestamp,
        });
      }
    }

    // gradePattern fans out to NotationStrip + CatExpressions via the
    // judge's chained onResult hooks.
    var result = this._judge.gradePattern(relOnsets, pattern, this._d.T.BAR_LENGTH_BEATS);

    var diag = window.bongocatDiag;
    if (diag) {
      diag.log("grade.result", {
        collectedOnsets: relOnsets.length,
        perfects: result.perfects,
        goods: result.goods,
        misses: result.misses,
        extras: result.extras,
        lives: this._ctx.lives,
        score: this._ctx.score,
      });
    }

    this._recordStats(result);
    this._applyAutoCalibration(result);
    // No HUD grade flash — the per-slot badges on the notation strip are
    // the grade feedback channel.

    // FSM applies scoring, streak, lives, ramp — then transitions to
    // Demo/Response (next cycle) or Summary (game over).
    this._fsm.handlePatternResult(result);
  };

  RunController.prototype._onTransition = function (oldState, newState) {
    var S = this._d.FSM.STATES;
    if (newState === S.SUMMARY) {
      this._gen++;
      this._collecting = false;
      this._catQueuedFor = null;
      this._catDemo.stop();
      this._strip.stop();
      this._showSummary();
      return;
    }
    // Demo/Response entered from a pattern result → begin the next cycle.
    // (The first cycle is kicked off by start(); transitions out of
    // Response/Demo mid-cycle are driven by _beginCycle's own schedule.)
    if (oldState === S.RESPONSE && (newState === S.DEMO || newState === S.RESPONSE)) {
      this._beginCycle();
    }
  };

  // Upcoming previews: beyond the FSM's own nextPattern we pre-render
  // further bars from the seeds the generator WILL use next — exact while
  // difficulty is stable, refreshed every cycle so a ramp never leaves a
  // stale preview on screen.
  RunController.prototype._previewPatterns = function () {
    var d = this._d;
    var previews = [];
    if (this._ctx.nextPattern) previews.push(this._ctx.nextPattern);
    // Enough lookahead to fill two full ribbon rows at the widest layout
    // (4 columns × 2 rows = 8 bars incl. past + current); the ribbon's
    // viewport clip hides whatever doesn't fit the current width.
    for (var k = 1; k <= 6; k++) {
      previews.push(
        d.PatternGenerator.generate(this._ctx.difficulty + 1, this._seedCounter + k).currentPattern
      );
    }
    return previews;
  };

  // Fresh notation for a new run: full rebuild with the first pattern.
  RunController.prototype._showUpcoming = function () {
    this._strip.reset();
    this._strip.setPattern(this._ctx.currentPattern, this._previewPatterns());
    this._strip.setRunLabel(this._runLabel());
  };

  // 4-3-2-1 count-in: big descending numbers on the beat, cat pulse +
  // click per beat. Runs once at the top of every run (before calibration
  // when that's due) and again on Play Again.
  RunController.prototype._runCountIn = function (done) {
    if (this._destroyed) return;
    var self = this;
    var gen = ++this._gen;
    var beats = this._d.T.COUNT_IN_LENGTH_BEATS;
    var overlay = this._els.countdown;

    this._beatClock.start(this._config.bpm);
    this._catQueuedFor = null; // fresh timeline — no chained cycle pending
    overlay.style.display = "";

    for (var b = 0; b < beats; b++) {
      (function (beat) {
        self._scheduleAt(gen, beat, function () {
          overlay.textContent = String(beats - beat);
          self._catDemo.pulse(beat);
        });
      })(b);
    }
    this._scheduleAt(gen, beats, function () {
      overlay.style.display = "none";
      // The first cycle chains seamlessly off the count-in: its downbeat
      // is the very next beat on the same running clock.
      self._nextCycleStart = beats;
      done();
    });
  };

  RunController.prototype._runLabel = function () {
    var mode = this._config.mode === "challenge" ? "Challenge" : "Learning";
    var instr = this._config.instrument.charAt(0).toUpperCase() + this._config.instrument.slice(1);
    return mode + " · " + instr + " · " + this._config.bpm + " BPM";
  };

  RunController.prototype._onCatDemoState = function (oldState, newState) {
    // CatDemo drives its own count-in/demo animation; FSM transitions are
    // scheduled on the beat clock in _beginCycle. Nothing to do here — kept
    // as a hook for grade-reactive cat animation later.
  };

  // ---------------------------------------------------------------------------
  // Onset collection
  // ---------------------------------------------------------------------------

  RunController.prototype._onOnset = function (onset) {
    var diag = window.bongocatDiag;
    if (!this._collecting || this._destroyed) {
      if (diag) diag.log("onset.dropped", { reason: "not-collecting", onset: onset });
      return;
    }
    // Collection window: one bar normally; the whole loop while calibrating.
    var win = this._collectWindowBeats || this._d.T.BAR_LENGTH_BEATS;
    var slack = this._beatClock.msToBeats(this._d.T.GOOD_OUTER_MS);
    var rel = onset.beatTime - this._responseStartBeat;
    if (rel < -slack || rel > win + slack) {
      if (diag) diag.log("onset.dropped", { reason: "outside-window", relBeat: rel, onset: onset });
      return; // outside the response window
    }
    if (diag) diag.log("onset.accepted", { relBeat: rel, onset: onset });
    this._collectedOnsets.push(onset);
    this._judgeLive(rel);
  };

  // Immediate feedback: judge the onset against the nearest unclaimed
  // expected onset right now and paint the slot badge + HUD flash. The
  // bar-end gradePattern stays authoritative (it repaints every slot and
  // adds misses) — a divergence between the greedy live match and the
  // final match is corrected at that point.
  RunController.prototype._judgeLive = function (relBeat) {
    var pattern = this._livePattern;
    if (!pattern || !this._strip) return;

    var expected = pattern.expectedOnsets;
    var goodBeats = this._beatClock.msToBeats(this._d.T.GOOD_OUTER_MS);
    var perfectBeats = this._beatClock.msToBeats(this._d.T.PERFECT_INNER_MS);

    var bestIdx = -1;
    var bestDelta = Infinity;
    for (var i = 0; i < expected.length; i++) {
      if (this._liveMatched[i]) continue;
      var delta = Math.abs(relBeat - expected[i]);
      if (delta < bestDelta) {
        bestDelta = delta;
        bestIdx = i;
      }
    }

    var msPerBeat = 60000 / this._config.bpm;
    if (bestIdx !== -1 && bestDelta <= goodBeats) {
      this._liveMatched[bestIdx] = true;
      var deltaMs = (relBeat - expected[bestIdx]) * msPerBeat;
      var key;
      if (bestDelta <= perfectBeats) key = "perfect";
      else key = deltaMs > 0 ? "late" : "good";
      this._strip.showLiveGrade(expected[bestIdx], key, deltaMs);
    }
    // Extras get no badge — no slot owns them, and the HUD flash that used
    // to announce them cluttered the streak sticker.
  };

  // --- Guitar: onset detection over the continuous pitch stream ------------
  // The game is onset-only (pitch is never judged), so we subscribe to the
  // SDK's continuous YIN stream (sdk.scoring.createContinuous — engine
  // bridge on desktop, mic on web) and derive onsets from it.
  //
  // Dip-recovery detector: a pick attack's transient is inharmonic, so YIN
  // confidence DIPS briefly on every re-pick even when the pitch doesn't
  // change and the note never decays to silence. We track the confidence
  // minimum since the last onset; a recovery of ≥ REARM_DIP above that
  // minimum (while ≥ FIRE_MIN) is a new onset. This catches repeated
  // same-pitch hits — the common case in a rhythm trainer — where a plain
  // silence-rearm threshold only ever fires once per note. A pitch jump of
  // ≥ NOTE_JUMP semitones while confident also fires (legato/hammer-ons).
  // InputAdapter.handleRawOnset applies the debounce + calibration offset.

  var FIRE_MIN = 0.5;    // confidence floor to fire at all
  var REARM_DIP = 0.18;  // required dip below the running max before re-firing
  // 1.5 semitones: pick-transient pitch wobble reaches ~1 semitone and was
  // firing spurious extras at 0.6; real note changes are ≥ 1 fret + slide.
  var NOTE_JUMP = 1.5;

  RunController.prototype._startGuitarListener = function () {
    var diag = window.bongocatDiag;
    if (this._config.instrument !== "guitar") return;

    // Preferred: energy-based attack detection on raw engine audio frames
    // (the device the player actually plays through). A pick attack is an
    // RMS spike — pitch-agnostic, ~25-40 ms latency, and it doesn't miss
    // notes the way YIN confidence heuristics do (field logs showed the
    // pitch path detecting 2 of 8 played notes, 200-300 ms late).
    var audio = (window.feedBackDesktop && window.feedBackDesktop.audio)
      || (window.desktop && window.desktop.audio);
    if (audio && typeof audio.getRawAudioFrame === "function") {
      this._startGuitarEnergyListener(audio);
      return;
    }

    // Web fallback: onset heuristics over the SDK's continuous YIN stream.
    this._startGuitarPitchListener();
  };

  // --- Energy path (desktop engine bridge) ---------------------------------

  var ENERGY_POLL_MS = 25;      // ~40 Hz, matches the SDK's bridge cadence
  var ENERGY_FLOOR = 0.003;     // ignore noise below ~-50 dBFS RMS
  var ENERGY_RATIO = 1.6;       // rms must exceed envelope by this factor
  var ENERGY_REFRACTORY_MS = 70; // matches the input debounce
  var FRAME_SIZE = 2048;        // ≈ 42 ms at 48 kHz

  RunController.prototype._startGuitarEnergyListener = function (audio) {
    var self = this;
    var diag = window.bongocatDiag;
    var env = 0;                // decaying energy envelope
    var lastOnsetT = 0;
    var stopped = false;
    var holdsCaptureDemand = false;
    this._energyStop = function () {
      stopped = true;
      if (holdsCaptureDemand) {
        holdsCaptureDemand = false;
        try { audio.leases.releaseDemand("capture", "bongocat"); } catch (_) {}
      }
    };

    // Make sure the engine is capturing. Preferred: the desktop lease
    // registry's refcounted 'capture' demand (ownership plan 6.1) — the
    // engine runs while any holder needs it, released on stop/death, no
    // start-then-undo bookkeeping. Legacy raw start on old desktop mains.
    Promise.resolve()
      .then(function () {
        if (audio.leases && typeof audio.leases.acquireDemand === "function") {
          return audio.leases.acquireDemand("capture", "bongocat").then(function () {
            holdsCaptureDemand = true;
          });
        }
        if (typeof audio.isAudioRunning === "function") {
          return audio.isAudioRunning().then(function (running) {
            if (!running && typeof audio.startAudio === "function") {
              return audio.startAudio();
            }
          });
        }
      })
      .catch(function () { /* best-effort; poll anyway */ })
      .then(function () {
        if (stopped || self._destroyed) return;
        if (diag) diag.log("guitar.energy.listening");
        tick();
      });

    function tick() {
      if (stopped || self._destroyed) return;
      var t0 = performance.now();
      Promise.resolve(audio.getRawAudioFrame(FRAME_SIZE)).then(function (frame) {
        if (stopped || self._destroyed) return;
        if (frame && frame.length) {
          // Split the ~42 ms frame into 4 sub-windows (~10.7 ms) and run
          // detection per sub-window. Whole-frame RMS dilutes a short
          // sixteenth-note spike in the previous note's ring; sub-windows
          // keep the spike visible and give ~10 ms timing resolution.
          var now = performance.now();
          var sub = Math.floor(frame.length / 4) || frame.length;
          var subMs = 42.7 / 4; // 2048 samples @ 48 kHz split in four
          for (var w = 0; w < 4; w++) {
            var start = w * sub;
            var end = Math.min(start + sub, frame.length);
            var sum = 0;
            for (var i = start; i < end; i++) sum += frame[i] * frame[i];
            var rms = Math.sqrt(sum / (end - start));
            // Sub-window center on the wall clock (frame ends "now").
            var subT = now - (4 - w - 0.5) * subMs;

            // Follow-up picks in a run of eighths/sixteenths are lighter
            // (alternate-picking upstrokes) — within 300 ms of the last
            // onset a smaller spike is still a pick.
            var ratio = (subT - lastOnsetT < 300) ? 1.35 : ENERGY_RATIO;

            if (rms > ENERGY_FLOOR && rms > env * ratio &&
                subT - lastOnsetT >= ENERGY_REFRACTORY_MS) {
              lastOnsetT = subT;
              if (diag) diag.log("guitar.onset", { kind: "energy", rms: rms, env: env, tMs: subT });
              self._inputAdapter.handleRawOnset("guitar", subT);
              // Settle the envelope BELOW the spike so a softer follow-up
              // pick can still clear the continuation ratio.
              env = Math.max(env, rms * 0.75);
            } else {
              // Asymmetric envelope: catch up fast, release quick enough
              // that re-picks over a ringing chord clear the ratio.
              // (Per-sub-window release ≈ the old 0.12-per-poll rate.)
              env = env + (rms - env) * (rms > env ? 0.4 : 0.035);
            }
          }
        }
        schedule(t0);
      }).catch(function () {
        schedule(t0); // transient IPC hiccup
      });
    }

    function schedule(t0) {
      if (stopped || self._destroyed) return;
      var elapsed = performance.now() - t0;
      setTimeout(tick, Math.max(0, ENERGY_POLL_MS - elapsed));
    }
  };

  // --- Pitch-stream fallback (web) ------------------------------------------

  RunController.prototype._startGuitarPitchListener = function () {
    var diag = window.bongocatDiag;
    if (!this._sdk || !this._sdk.scoring || typeof this._sdk.scoring.createContinuous !== "function") {
      if (diag) diag.log("guitar.pitch.unavailable", { reason: "sdk.scoring.createContinuous missing" });
      return;
    }

    var self = this;
    var minSinceOnset = 0;   // running confidence minimum since the last onset
    var minT = 0;            // tMs at that minimum (≈ the pick transient)
    var crossT = 0;          // tMs when confidence last rose through FIRE_MIN
    var prevConf = 0;
    var lastMidi = null;     // stable pitch of the current note
    var pendingJumpMidi = null; // pitch-jump confirmation state
    var pendingJumpCount = 0;

    this._pitchHandle = this._sdk.scoring.createContinuous({ smoothingMs: 20 });
    this._pitchHandle.on("pitch", function (p) {
      if (self._destroyed) return;

      var conf = p.confidence || 0;
      if (conf < minSinceOnset) { minSinceOnset = conf; minT = p.tMs; }
      if (prevConf < FIRE_MIN && conf >= FIRE_MIN) crossT = p.tMs;
      prevConf = conf;
      if (conf < FIRE_MIN) return;

      var recovered = conf - minSinceOnset >= REARM_DIP;

      // Pitch jump needs CONFIRMATION: YIN flips between the fundamental
      // and its harmonics frame-to-frame on a ringing note (log shows
      // 37↔43↔56 alternating every ~27 ms) — a real note change holds its
      // new pitch. Fire only after two consecutive frames within 0.5 st.
      var pitchJump = false;
      if (lastMidi !== null && Math.abs(p.midiFloat - lastMidi) >= NOTE_JUMP) {
        if (pendingJumpMidi !== null && Math.abs(p.midiFloat - pendingJumpMidi) <= 0.5) {
          pendingJumpCount++;
          if (pendingJumpCount >= 2) pitchJump = true;
        } else {
          pendingJumpMidi = p.midiFloat;
          pendingJumpCount = 1;
        }
      } else {
        pendingJumpMidi = null;
        pendingJumpCount = 0;
      }

      if (recovered || pitchJump) {
        var dip = conf - minSinceOnset;
        // Backdate the onset to the physical event, not the detection:
        // for a re-pick that's the confidence dip's bottom (the transient);
        // for an attack from silence it's the moment confidence rose
        // through FIRE_MIN. Whichever happened more recently is the one
        // belonging to THIS onset.
        var onsetT = recovered ? Math.max(minT, crossT) : p.tMs;
        minSinceOnset = conf;   // must dip again before the next fire
        minT = p.tMs;
        lastMidi = p.midiFloat;
        pendingJumpMidi = null;
        pendingJumpCount = 0;
        if (diag) {
          diag.log("guitar.onset", {
            kind: recovered ? "attack" : "pitch-jump",
            midiFloat: p.midiFloat,
            confidence: conf,
            dip: dip,
            tMs: onsetT,
            latencyMs: Math.round(p.tMs - onsetT),
          });
        }
        self._inputAdapter.handleRawOnset("guitar", onsetT);
      } else if (pendingJumpMidi === null) {
        // Track the held note's pitch so slow drift doesn't fake a jump.
        lastMidi = p.midiFloat;
      }
    });
    this._pitchHandle.on("end", function (info) {
      if (diag) diag.log("guitar.pitch.ended", info);
    });
    if (diag) diag.log("guitar.pitch.listening");
  };

  RunController.prototype._stopGuitarListener = function () {
    if (this._energyStop) {
      this._energyStop();
      this._energyStop = null;
    }
    if (this._pitchHandle) {
      try { this._pitchHandle.stop(); } catch (e) {}
      this._pitchHandle = null;
    }
  };

  // ---------------------------------------------------------------------------
  // Stats + summary
  // ---------------------------------------------------------------------------

  RunController.prototype._resetStats = function () {
    this._stats = {
      patternsSurvived: 0,
      perfects: 0,
      goods: 0,
      misses: 0,
      extras: 0,
      totalExpected: 0,
      timingErrSumMs: 0,
      timingErrCount: 0,
      bestStreak: 0,
    };
  };

  RunController.prototype._recordStats = function (result) {
    var s = this._stats;
    s.patternsSurvived += 1;
    s.perfects += result.perfects;
    s.goods += result.goods;
    s.misses += result.misses;
    s.extras += result.extras;
    s.totalExpected += result.totalOnsets;

    var msPerBeat = 60000 / this._config.bpm;
    for (var i = 0; i < result.grades.length; i++) {
      var g = result.grades[i];
      if (g.onsetBeatTime !== null && g.playerBeatTime !== null) {
        s.timingErrSumMs += Math.abs(g.playerBeatTime - g.onsetBeatTime) * msPerBeat;
        s.timingErrCount += 1;
      }
    }
    if (this._ctx.streak > s.bestStreak) s.bestStreak = this._ctx.streak;
  };

  // --- Calibration phase (pre-run) ------------------------------------------
  // The cat taps steady 4/4 bars; the player plays along on every beat.
  // Each bar's median timing error is folded into the persisted calibration
  // offset at full gain; converged when a bar's residual lands inside the
  // dead-band (±25 ms) after at least MIN_BARS, capped at MAX_BARS.

  var CAL_MIN_BARS = 2;
  var CAL_MAX_BARS = 8;
  var CAL_DONE_MS = 25;      // residual median within this = calibrated
  var CAL_MIN_TAPS = 3;      // taps needed for a bar to count
  var CAL_WIDE_MS = 350;     // pair taps to beats within this window

  RunController.prototype._maybeCalibrate = function (done) {
    var mode = this._config.calibration || "auto";
    if (this._config.instrument !== "guitar" || mode === "off") {
      done();
      return;
    }
    if (mode === "auto") {
      var stored = null;
      try { stored = localStorage.getItem("bongocat.calibration.mic-default"); } catch (e) {}
      if (stored !== null) {
        done();
        return; // already calibrated on this device
      }
    }

    var diag = window.bongocatDiag;
    if (diag) diag.log("calibration.phase.start", { mode: mode });

    this._els.calibration.style.display = "";
    this._setCalibrationText("Calibration — play a note on every beat, along with the cat.");
    this._catDemo.setLabels("Tap the beat!", null);

    this._startCalibrationLoop(done);
  };

  // One CONTINUOUS metronome for the whole phase — no per-bar restarts,
  // which read as stutters and throw the player's pulse off. The clock
  // starts once, the cat taps straight quarters, and every 4 beats the
  // taps collected since the last evaluation are folded into the offset.
  RunController.prototype._startCalibrationLoop = function (done) {
    if (this._destroyed) return;
    var self = this;
    var d = this._d;
    var gen = ++this._gen;
    var bar = d.T.BAR_LENGTH_BEATS;
    var loopBeats = CAL_MAX_BARS * bar + bar; // headroom past the last eval

    this._beatClock.start(this._config.bpm);
    this._nextCycleStart = null; // clock restarted — realign after calibration
    this._catDemo.stop();
    this._catDemo.setCountInBeats(0);
    this._catDemo.setPattern(null);
    this._catDemo.setResponseBeats(0);
    this._catDemo.setDemoBeats(loopBeats);
    this._catDemo.start();

    // Collect onsets across the whole loop (no live judging: no pattern).
    this._responseStartBeat = 0;
    this._collectedOnsets = [];
    this._livePattern = null;
    this._liveMatched = [];
    this._collectWindowBeats = loopBeats;
    this._collecting = true;

    this._calState = { barNum: 0, lastIdx: 0, gen: gen, done: done };
    var slackBeats = this._beatClock.msToBeats(CAL_WIDE_MS);
    this._scheduleAt(gen, bar + slackBeats, function () { self._calibrationTick(); });
  };

  RunController.prototype._calibrationTick = function () {
    if (this._destroyed || !this._calState) return;
    var self = this;
    var st = this._calState;
    var diag = window.bongocatDiag;
    var msPerBeat = 60000 / this._config.bpm;
    var bar = this._d.T.BAR_LENGTH_BEATS;
    st.barNum++;

    // Only taps that arrived since the previous evaluation — earlier taps
    // were stamped under the previous offset and would double-count it.
    var taps = this._collectedOnsets.slice(st.lastIdx);
    st.lastIdx = this._collectedOnsets.length;

    // Error of each tap against its nearest whole beat on the running clock.
    var errs = [];
    for (var i = 0; i < taps.length; i++) {
      var errMs = (taps[i].beatTime - Math.round(taps[i].beatTime)) * msPerBeat;
      if (Math.abs(errMs) <= CAL_WIDE_MS) errs.push(errMs);
    }

    if (errs.length >= CAL_MIN_TAPS) {
      errs.sort(function (a, c) { return a - c; });
      var median = errs[Math.floor(errs.length / 2)];
      var current = this._inputAdapter.getCalibrationOffset();
      var applied = Math.max(-100, Math.min(400, current + median));
      try {
        localStorage.setItem("bongocat.calibration.mic-default", String(Math.round(applied)));
      } catch (e) {}
      this._inputAdapter._loadCalibration();

      if (diag) {
        diag.log("calibration.bar", {
          bar: st.barNum, taps: errs.length,
          medianErrMs: Math.round(median), offsetMs: Math.round(applied),
        });
      }

      var converged = st.barNum >= CAL_MIN_BARS && Math.abs(median) <= CAL_DONE_MS;
      if (converged || st.barNum >= CAL_MAX_BARS) {
        this._finishCalibration(applied, st.done);
        return;
      }
      this._setCalibrationText(
        "Calibrating… bar " + st.barNum + " — offset " + Math.round(applied) + " ms. Keep tapping!"
      );
    } else {
      if (diag) diag.log("calibration.bar", { bar: st.barNum, taps: errs.length, skipped: true });
      if (st.barNum >= CAL_MAX_BARS) {
        // Not enough signal — keep whatever offset we have and move on.
        this._finishCalibration(this._inputAdapter.getCalibrationOffset(), st.done);
        return;
      }
      this._setCalibrationText("Calibration — play a note on every beat, along with the cat.");
    }

    var slackBeats = this._beatClock.msToBeats(CAL_WIDE_MS);
    this._scheduleAt(st.gen, (st.barNum + 1) * bar + slackBeats, function () {
      self._calibrationTick();
    });
  };

  RunController.prototype._finishCalibration = function (offsetMs, done) {
    var self = this;
    var diag = window.bongocatDiag;
    if (diag) diag.log("calibration.phase.done", { offsetMs: Math.round(offsetMs || 0) });

    this._collecting = false;
    this._collectWindowBeats = null;
    this._calState = null;
    this._catDemo.stop();
    this._catDemo.setDemoBeats(this._d.T.BAR_LENGTH_BEATS);
    this._setCalibrationText("Calibrated! Offset " + Math.round(offsetMs || 0) + " ms.");
    // Restore the run's phase labels.
    var isChallenge = this._config.mode === "challenge";
    this._catDemo.setLabels(isChallenge ? "Your turn!" : "Listen…", "Your turn!");

    setTimeout(function () {
      if (self._destroyed) return;
      self._els.calibration.style.display = "none";
      done();
    }, 900);
  };

  RunController.prototype._setCalibrationText = function (text) {
    if (this._els.calibration) {
      this._els.calibration.textContent = text;
    }
  };

  // Auto-calibration: any CONSTANT lag between the physical pick and its
  // detected timestamp (ASIO buffers, engine tap, poll cadence) shows up
  // as the same signed timing error on every matched hit — field logs
  // showed a stable +190 ms. After each bar, nudge the persisted guitar
  // calibration offset toward the bar's median signed error. Slow gain +
  // clamp keep genuine (inconsistent) player error from being absorbed.
  RunController.prototype._applyAutoCalibration = function (result) {
    if (this._config.instrument !== "guitar") return;

    var msPerBeat = 60000 / this._config.bpm;
    var errs = [];
    var extras = [];   // player onsets that matched nothing (beat times)
    var missed = [];   // expected onsets nobody hit
    for (var i = 0; i < result.grades.length; i++) {
      var g = result.grades[i];
      if (g.onsetBeatTime !== null && g.playerBeatTime !== null) {
        errs.push((g.playerBeatTime - g.onsetBeatTime) * msPerBeat);
      } else if (g.playerBeatTime !== null) {
        extras.push(g.playerBeatTime);
      } else if (g.onsetBeatTime !== null) {
        missed.push(g.onsetBeatTime);
      }
    }

    // A latency LARGER than the good window produces no matched hits at
    // all — every hit grades as a miss+extra pair. Recover the signal by
    // pairing each extra with the nearest unclaimed missed slot within a
    // wide (±350 ms) search window.
    if (errs.length < 2 && extras.length && missed.length) {
      var wideBeats = 350 / msPerBeat;
      var claimed = new Array(missed.length).fill(false);
      for (var e = 0; e < extras.length; e++) {
        var bestIdx = -1;
        var bestDelta = Infinity;
        for (var m = 0; m < missed.length; m++) {
          if (claimed[m]) continue;
          var delta = Math.abs(extras[e] - missed[m]);
          if (delta < bestDelta) { bestDelta = delta; bestIdx = m; }
        }
        if (bestIdx !== -1 && bestDelta <= wideBeats) {
          claimed[bestIdx] = true;
          errs.push((extras[e] - missed[bestIdx]) * msPerBeat);
        }
      }
    }
    // Field logs showed the auto-cal yanking a freshly tap-calibrated
    // offset around off 2-4 loosely-paired samples — require a real bar's
    // worth of evidence and move gently.
    if (errs.length < 4) return; // too little signal in this bar

    errs.sort(function (a, b) { return a - b; });
    var median = errs[Math.floor(errs.length / 2)];
    if (Math.abs(median) < 30) return; // within noise — leave the offset be

    var current = this._inputAdapter.getCalibrationOffset();
    var next = Math.max(-100, Math.min(400, current + median * 0.35));
    try {
      localStorage.setItem("bongocat.calibration.mic-default", String(Math.round(next)));
    } catch (e) { /* private mode — offset just won't persist */ }
    this._inputAdapter._loadCalibration();

    var diag = window.bongocatDiag;
    if (diag) {
      diag.log("calibration.auto", {
        medianErrMs: Math.round(median),
        offsetMs: Math.round(next),
        samples: errs.length,
      });
    }
  };

  RunController.prototype._dominantGrade = function (result) {
    if (result.misses > 0 || result.extras > 0) return "miss";
    if (result.goods > 0) return "good";
    return "perfect";
  };

  RunController.prototype._showSummary = function () {
    var self = this;
    var d = this._d;
    var s = this._stats;
    var accuracy = s.totalExpected > 0
      ? ((s.perfects + s.goods) / s.totalExpected) * 100
      : 0;
    var finalScore = this._ctx.score;
    var avgErr = s.timingErrCount > 0 ? Math.round(s.timingErrSumMs / s.timingErrCount) : 0;
    var durationMs = Math.round(
      ((typeof performance !== "undefined" && performance.now)
        ? performance.now() : Date.now()) - this._startedAt);

    this._persistRun(finalScore, accuracy, avgErr, durationMs);

    this._summary = new d.RunSummary(this._els.summary, {
      stateContext: this._ctx,
      patternsSurvived: s.patternsSurvived,
      accuracy: accuracy,
      onPlayAgain: function () {
        self._summary.destroy();
        self._summary = null;
        self._fsm.playAgain();          // Summary → Setup
        self._resetStats();
        self._startedAt = (typeof performance !== "undefined" && performance.now)
          ? performance.now() : Date.now();
        // New patterns first, so the count-in shows what's coming (not the
        // previous run's graded bars).
        if (!self._fsm.startRun(self._config.mode)) return;
        self._showUpcoming();
        self._runCountIn(function () {
          self._beginCycle();
        });
      },
      onExit: function () {
        // Hand the result to the host: submits the run, awards XP, shows
        // the platform run summary, and calls spec.stop() for teardown.
        if (self._sdk && typeof self._sdk.end === "function") {
          self._sdk.end({
            score: finalScore,
            durationMs: durationMs,
            summaryHtml: s.patternsSurvived + " patterns · " +
              Math.round(accuracy) + "% accuracy · best streak " + s.bestStreak,
          });
        }
      },
    });
    this._summary.render();
  };

  RunController.prototype._persistRun = function (score, accuracy, avgErrMs, durationMs) {
    var d = this._d;
    if (!d.RunHistory || !this._sdk) return;
    try {
      var rh = new d.RunHistory(this._sdk);
      rh.saveRun({
        instrument: this._config.instrument,
        mode: this._config.mode,
        bpm: this._config.bpm,
        score: score,
        duration_ms: durationMs,
        avg_timing_error_ms: avgErrMs,
        patterns_survived: this._stats.patternsSurvived,
        modifiers: {
          instrument: this._config.instrument,
          mode: this._config.mode,
          tempo: String(this._config.bpm),
        },
        summary_html: "",
      }, function (err) {
        if (err) console.warn("BongoCat: run history save failed:", err.message);
      });
    } catch (e) {
      console.warn("BongoCat: run history unavailable:", e.message);
    }
  };

  // ---------------------------------------------------------------------------
  // Scheduling helper — generation-guarded (BeatClock's setTimeout-based
  // scheduleAtBeat can't be cancelled, so stale callbacks self-discard).
  // ---------------------------------------------------------------------------

  RunController.prototype._scheduleAt = function (gen, beat, fn) {
    var self = this;
    this._beatClock.scheduleAtBeat(beat, function () {
      if (gen !== self._gen || self._destroyed) return;
      fn();
    });
  };

  // ---------------------------------------------------------------------------
  // Module export
  // ---------------------------------------------------------------------------

  if (typeof window.feedBackMinigamesRunController === "undefined") {
    window.feedBackMinigamesRunController = {};
  }
  window.feedBackMinigamesRunController.RunController = RunController;
})();
