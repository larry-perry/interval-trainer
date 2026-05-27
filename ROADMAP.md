# Roadmap & ideas

A living list of where the trainer could go. **★ = you specifically asked for it.**
Nothing here is committed-to; it's a menu. My suggested next steps are at the bottom.

---

## Persistence — quick wins
Small, high-value, and they unlock the stats work below.

- **★ Remember selected intervals across reloads.** Save the chosen intervals to
  `localStorage`, restore on load.
- **★ Save score/tracking info across reloads.** Persist stats (and the history
  needed for the graphs below) so progress survives a refresh.
- **Remember the rest of the settings** too: mode (Reading/Ear), keyboard size,
  auto-advance, mic on/off, last MIDI device.

## Stats & progress
The big one — turn the app from "drill" into "see yourself improve."

- **★ Accuracy per note × interval combo.** Track correct/attempts keyed by
  `(rootPc, interval)`. Show it as a 12×11 heatmap (root note vs interval) and/or
  a per-interval bar chart, so weak spots jump out. (Needs the persistence above.)
- **★ Heatmap accuracy ↔ time toggle.** Switch the heatmap / per-combo view
  between accuracy (correct %) and time-to-correct (average ms). Same grid,
  two lenses on weakness.
- **★ Time-to-correct-note.** Measure ms from prompt → correct note; show average
  and a trend. *Caveat:* for the mic, audio/detection latency would need a quick
  calibration step to keep the number honest (MIDI is exact).
- **Session summary.** After a run: accuracy, weakest intervals, fastest/slowest,
  best streak.
- **Progress over time.** A daily line chart of accuracy and speed.
- **Export.** Download stats as CSV/JSON.

## Practice flow
- **★ Learn-from-the-miss loop.** After a wrong answer, keep listening: every note
  you play *sounds* (★ "play a sound when you click a note after a wrong note"),
  and when you finally hit the right one it **auto-advances without scoring it
  correct** (★). Turns a miss into a guided correction instead of a dead end.
- **★ Slight weak-spot weighting option.** When enabled, incorrectly answered
  or slow-to-answer `(note, interval)` combos appear *very slightly* more often
  in the pool — not a hard focus mode, just a gentle nudge. On by default.
- **Adaptive practice.** Weight questions toward your weak `(note, interval)`
  combos using the tracked data; a "drill my weak spots" toggle.
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
- **Staff notation.** Show the prompt/answer on a staff to tie ear ↔ reading.
- **Register selection.** Let prompts target a chosen octave range (e.g. match
  your piano).
- **Compound intervals** (9ths+) and the octave, for an "advanced" mode.

## Input & audio
- **Mic robustness.** Latency calibration, octave-error correction, a confidence
  meter, and "play firmly / use headphones" guidance.
- **Chord / two-note detection** from MIDI and mic (enables "play both notes").
- **Sound options.** Instrument timbre, volume, optional metronome/count-in.
- **Sustain-pedal awareness** for MIDI.

## Platform & polish
- **PWA** — installable + offline. Especially nice on iPad (mic mode), and gives
  an app-like home-screen icon.
- **Settings panel** consolidating all the options as they grow.
- **Accessibility** — full keyboard navigation, ARIA labels, and color-blind-safe
  feedback (icons/patterns, not red/green alone).
- **Themes / dark mode.**
- **Multiple profiles** if more than one person practices.

---

## If I were picking the next three
1. **Persistence (intervals + stats + settings).** Cheap, and everything else
   leans on it. Do this first.
2. **The learn-from-the-miss loop.** It's the highest-impact *practice* change and
   you already scoped it well — it makes misses productive.
3. **Per-combo accuracy heatmap.** This is the feature that makes the app feel
   genuinely yours: it shows exactly which intervals/notes to work on, and sets up
   adaptive practice later.

Response-time tracking pairs naturally with #3 (same data plumbing) — I'd add it
right after, MIDI-first so we sidestep the mic-latency question initially.
