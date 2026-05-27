/* trainer.js — the practice engine (pure logic, no DOM or audio).
 *
 * Two modes share the same machinery — generate a question (root + interval),
 * wait for a played note, judge it:
 *   'play' : the interval is named; you must play the right note from theory.
 *   'ear'  : the interval is played, not named; you reproduce the note by ear,
 *            and the name is revealed afterwards.
 *
 * Judging is lenient on octave: the correct pitch class in any octave counts,
 * because on a real keyboard you naturally land in whatever octave is comfortable.
 */
(function (App) {
  'use strict';

  const { spellAbove, rootDisplayName, pitchClass, intervalBySemi } = App.theory;

  // Keep roots central so the target note stays on the on-screen keyboard (48–84).
  const ROOT_MIN = 55; // G3
  const ROOT_MAX = 67; // G4

  function createTrainer() {
    let mode = 'play';
    let selected = new Set();
    let question = null;
    let phase = 'idle'; // idle | awaiting | answered
    const stats = { correct: 0, wrong: 0, streak: 0, best: 0, total: 0 };

    const setMode = (m) => { mode = m; };
    const setSelected = (set) => { selected = new Set(set); };
    const hasSelection = () => selected.size > 0;

    function resetStats() {
      stats.correct = stats.wrong = stats.streak = stats.best = stats.total = 0;
    }

    function next() {
      if (!hasSelection()) return null;
      const semis = [...selected];

      let rootMidi, semi, attempts = 0;
      do {
        semi = semis[Math.floor(Math.random() * semis.length)];
        rootMidi = ROOT_MIN + Math.floor(Math.random() * (ROOT_MAX - ROOT_MIN + 1));
        attempts++;
      } while (question && rootMidi === question.rootMidi && attempts < 40);

      const rootDisplay = rootDisplayName(rootMidi);
      const answer = spellAbove(rootMidi, rootDisplay, semi);
      question = {
        rootMidi,
        semi,
        targetMidi: rootMidi + semi,
        rootDisplay,
        answer,                       // { display, accurate }
        interval: intervalBySemi(semi), // { semi, name, label }
      };
      phase = 'awaiting';
      return question;
    }

    // Judge a played note. Returns a result object, or null if not awaiting input.
    function answer(playedMidi) {
      if (phase !== 'awaiting' || !question) return null;
      phase = 'answered';

      const exact = playedMidi === question.targetMidi;
      const samePc = pitchClass(playedMidi) === pitchClass(question.targetMidi);
      const result = exact ? 'correct' : samePc ? 'octave' : 'wrong';

      stats.total++;
      if (result === 'wrong') {
        stats.wrong++;
        stats.streak = 0;
      } else {
        stats.correct++;
        stats.streak++;
        if (stats.streak > stats.best) stats.best = stats.streak;
      }

      return { result, playedMidi, question };
    }

    const accuracy = () => (stats.total ? Math.round((stats.correct / stats.total) * 100) : 0);

    return {
      setMode, setSelected, hasSelection, resetStats, next, answer, accuracy,
      get mode() { return mode; },
      get phase() { return phase; },
      get question() { return question; },
      get stats() { return stats; },
    };
  }

  App.createTrainer = createTrainer;
})(window.App = window.App || {});
