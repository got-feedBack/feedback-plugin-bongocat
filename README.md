# Bongo Cat's Rhythm Trainer

A feedBack minigame plugin for practicing rhythms on your real instrument — guitar, bass, piano, or drums. Bongo Cat demos a rhythm pattern in time with the metronome, then you play it back; your hits are picked up through feedBack's note detection and judged against the beat.

## How it works

- Pick an instrument, mode, and tempo from the minigame modifiers.
- Bongo Cat plays the pattern first (with paw animations synced to the beat), and a notation strip shows what to play.
- Play the pattern back. Each hit is scored discretely (timing judgement per note), with a HUD tracking your accuracy and streak.
- **Learning mode** eases you in and repeats patterns; **Challenge mode** keeps generating new ones and pushes the difficulty.
- Run history is kept per session so you can see your progress over time.

## Modifiers

| Modifier | Values | Default |
|---|---|---|
| Instrument | guitar, piano, drums | guitar |
| Mode | learning, challenge | learning |
| Tempo (BPM) | 60–160 in steps | 80 |
| Calibration | auto, on, off | auto |

## Structure

- `game.js` — plugin entry point
- `src/` — game logic: beat clock, pattern generator, input gate/judge, scoring, run controller, FSM, HUD, notation strip, cat animations
- `src/notedetect-bridge.js` — bridge to feedBack's note-detection plugin
- `routes.py` — server-side routes
- `assets/` — sprites, fonts, styles
- `docs/implementation-artifacts/` — design notes per feature

## Development

```bash
npm install
npm test        # vitest
```
