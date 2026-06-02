# Roadmap & ideas

A living list of where the trainer could go. **★ = you specifically asked for it.**
Nothing here is committed-to; it's a menu. My suggested next steps are at the bottom.

---

## Shipped
A good chunk of the original wishlist has landed:

- **★ Persistence.** Selected intervals, mode, keyboard size, auto-advance,
  weak-spot settings, stats, and the per-combo history all save to `localStorage`
  and restore on load.
- **★ Per-combo accuracy heatmap.** A 12×11 grid (root note × interval) so weak
  spots jump out.
- **★ Accuracy ↔ time heatmap toggle.** Same grid, two lenses — correct % or
  average time-to-correct (ms).
- **★ Time-to-correct tracking.** Measures ms from prompt → correct note. *(Caveat
  still open: mic latency isn't calibrated, so mic times run optimistic; MIDI is exact.)*
- **★ Learn-from-the-miss loop.** After a wrong answer the app keeps listening,
  sounds your hunting taps, and auto-advances *without scoring it correct* when you
  finally hit the right note.
- **★ Weak-spot weighting.** Misses and slow `(note, interval)` combos come up more
  often, with a Gentle/Medium/Strong strength control. On by default.
- **Microphone pitch detection** (autocorrelation) feeding the shared input layer.
- **Circle-of-fifths root walk.** Optional: roots step C → G → D → A … through all
  twelve keys instead of being picked at random. Off by default.
- **Settings modal** consolidating auto-advance, the weak-spot nudge, and debug.
- **★ Flashcard / multiple-choice answers.** A *Keys / Cards* toggle: instead of
  playing the note, pick from four note-name cards (distractors are the notes other
  intervals above the same root would produce). Works in both Reading and Ear mode.
  *Next step here: prompt/answer as notes on a staff (see below).*

## Stats & progress
- **Session summary.** After a run: accuracy, weakest intervals, fastest/slowest,
  best streak.
- **Progress over time.** A daily line chart of accuracy and speed.
- **Export.** Download stats as CSV/JSON.

## Practice flow
- **Adaptive practice.** A dedicated "drill my weak spots" mode — a harder focus
  than the current gentle nudge — using the tracked data.
- **Quiz/session mode.** Fixed length (10/20/50), with a final score screen.
- **Reference drone.** Optionally hold the root quietly under Ear mode.
- **Speed mode.** Per-question countdown for pressure practice.

## More musical content
- **Descending intervals** (below the root), plus an ascending-vs-descending
  identification mode. *(Note: this needs octave/direction awareness back, which
  the current pitch-class model intentionally dropped — so it'd be a mode.)*
- **Harmonic intervals** — sound both notes together; optionally require you to
  **play both notes** (root + target), not just the target.
- **Key-constrained practice.** Restrict to a chosen key so spellings follow its
  signature and you drill diatonic intervals.
- **Staff notation.** Show the prompt/answer on a staff to tie ear ↔ reading. *Now
  the natural follow-on to the flashcard mode: render the root (and answer) on a
  staff, and offer staff-image cards as a third answer surface.*
- **Register selection.** Let prompts target a chosen octave range (e.g. match
  your piano).
- **Compound intervals** (9ths+) and the octave, for an "advanced" mode.

## Input & audio
- **Mic robustness.** Latency calibration (to make time-to-correct honest on the
  mic), octave-error correction, a confidence meter, and "play firmly / use
  headphones" guidance.
- **Chord / two-note detection** from MIDI and mic (enables "play both notes").
- **Sound options.** Instrument timbre, volume, optional metronome/count-in.
- **Sustain-pedal awareness** for MIDI.

## Platform & polish
- **PWA** — installable + offline. Especially nice on iPad (mic mode), and gives
  an app-like home-screen icon.
- **Accessibility** — full keyboard navigation, ARIA labels, and color-blind-safe
  feedback (icons/patterns, not red/green alone).
- **Themes / dark mode.**
- **Multiple profiles** if more than one person practices.

---

## If I were picking the next three
The persistence-and-stats foundation is in, so the next wins are about *practice
shape* and *reach*:

1. **Quiz/session mode.** Fixed-length runs with a score screen — small to build,
   and it turns open-ended drilling into something you can finish and compare.
2. **PWA + offline.** You've aimed mic mode at iPad; installability and an offline
   cache are the payoff that makes it feel like a real app there.
3. **Mic latency calibration.** Time-to-correct is already tracked, but mic latency
   makes those numbers optimistic — a quick calibration step closes that loop so the
   speed heatmap can be trusted on every input.

Descending/harmonic intervals are the natural follow-on once you want to grow the
*musical* content rather than the practice scaffolding.
