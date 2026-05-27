# Interval Trainer

> **Entirely vibe coded.** This project was built through conversations with an AI coding agent (Claude), not by sitting down and typing out every line by hand. The ideas, design direction, and musical scope are human; the commits are a collaboration.

Practice musical intervals on your **real piano**. The app prompts an interval,
you play it, and it tells you if you got it right — reading the note you played
from **USB MIDI**, the **microphone** (coming next), or the **on-screen keyboard**.

It builds on the interval-trainer idea from
[TuTempo Academia Musical](https://tutempo.com.co/interval-trainer/): same
concept, but instead of clicking the answer you play it on your instrument.

## Two modes

- **Reading** — the interval is named (e.g. "G — Major 3rd above"). Play the
  correct note from theory.
- **Ear** — the interval is *played*, not named. Reproduce the note you hear;
  the name is revealed after you answer.

Judging is by **pitch class** — the right note in *any* octave is correct ("which
note," not "which octave"). The prompt sounds the interval in a random octave for
ear variety, while you just play the right note name. The on-screen keyboard
defaults to a single, phone-friendly octave, with a **1 octave / Full** toggle.

**Playing the root is free** — it never counts as a mistake, so you can sound
the root to orient yourself (handy in Ear mode). On-screen clicks of the root
play it back. (For the octave interval, only the exact root note is free, since
the answer shares the root's pitch class.)

**Auto-advance** (toggle, on by default): about a second after a correct answer
it moves on to the next note automatically. Turn it off to advance manually.

## Running it

It's plain HTML/CSS/JS — no build step, no dependencies.

```bash
# from this folder, start any static server, then open the printed URL:
python3 -m http.server 8000
# → http://localhost:8000
```

Serving over `http://localhost` (or HTTPS) is recommended: Web MIDI and the mic
require a "secure context," which `localhost` satisfies. Opening `index.html`
directly via `file://` works in Chrome too, but a local server is the reliable
path.

## Input support

| Source | Where it works |
| --- | --- |
| **USB MIDI** | Chrome, Edge, Firefox, Chrome on Android. **Not Safari** (no Web MIDI). |
| **Microphone** | All modern browsers incl. iOS Safari. Autocorrelation pitch detection; works over a secure context (`localhost`/HTTPS). |
| **On-screen keyboard** | Everywhere. Always available as a fallback. |

The mic detector is monophonic (one note at a time) and gates itself while the
app plays a prompt so the speakers aren't heard as you. Detection thresholds are
tuned conservatively; if your room/piano needs different sensitivity, the knobs
live at the top of `js/pitch.js` (`RMS_GATE`, `CLARITY_GATE`) and in the mic loop
in `js/input.js` (`STABLE_FRAMES`, `SILENCE_FRAMES`). Use headphones, or expect
to play a touch firmly, for the cleanest detection.

Plug your piano in via its USB-MIDI port, grant the MIDI permission prompt, pick
the device in the top-right selector, and play. On iPad/iPhone (Safari has no
Web MIDI), use mic mode once it's in, or wrap this in Capacitor for native MIDI.

## Project layout

```
index.html        markup + script order
css/styles.css    the "manuscript paper" theme
js/theory.js      notes, intervals, frequencies, enharmonic spelling
js/audio.js       Web Audio piano-ish synth for prompts
js/pitch.js       autocorrelation pitch detection (mic)
js/piano.js       on-screen keyboard (input + visual feedback)
js/input.js       unified input layer (MIDI, mic, on-screen keyboard)
js/trainer.js     practice engine (questions, scoring) — no DOM/audio
js/app.js         wiring: DOM + trainer + audio + input
```

## Roadmap

Done so far:

- [x] Microphone pitch detection (autocorrelation) feeding the same input layer
- [x] Auto-advance after a correct answer
- [x] Playing the root is free (orient without penalty)
- [x] Pitch-class model (any octave counts) with randomized prompt octaves
- [x] Single-octave / full keyboard toggle; reset-score button

Planned features and ideas live in **[ROADMAP.md](ROADMAP.md)** — including
persistence, per-note/interval accuracy graphs, response-time tracking, a
learn-from-the-miss loop, descending/harmonic intervals, and a PWA wrapper.
