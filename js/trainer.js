/* trainer.js — the practice engine (pure logic, no DOM or audio).
 *
 * Pitch-class model: a question is a root pitch class + an interval. The answer
 * is judged by pitch class ("which note", any octave). What you HEAR is decoupled
 * from what you answer — the prompt sounds the real interval in a random octave
 * (audioRootMidi / audioTargetMidi), while you just play the right note name.
 *
 * Two modes share the machinery:
 *   'play' : the interval is named; play the right note from theory.
 *   'ear'  : the interval is played, not named; reproduce the note, name revealed after.
 */
(function (App) {
  'use strict';

  const { randomRootName, spellName, pitchClass, intervalBySemi } = App.theory;

  const AUDIO_OCTAVES = [3, 4, 5]; // octaves the prompt may sound in, for ear variety

  function createTrainer() {
    let mode = 'play';
    let selected = new Set();
    let question = null;
    let phase = 'idle'; // idle | awaiting | answered
    const stats = { correct: 0, wrong: 0, streak: 0, best: 0, total: 0 };
    let combosData = {}; // optional: { 'rootPc:semi': { a, c, t, n } }
    let weakSpotWeighting = false;

    const setMode = (m) => { mode = m; };
    const setSelected = (set) => { selected = new Set(set); };
    const hasSelection = () => selected.size > 0;
    const setCombos = (data) => { combosData = data || {}; };
    const setWeakSpotWeighting = (v) => { weakSpotWeighting = !!v; };

    function resetStats() {
      stats.correct = stats.wrong = stats.streak = stats.best = stats.total = 0;
    }

    function setStats(obj) {
      if (!obj) return;
      stats.correct = Number.isFinite(obj.correct) ? obj.correct : stats.correct;
      stats.wrong  = Number.isFinite(obj.wrong)  ? obj.wrong  : stats.wrong;
      stats.streak = Number.isFinite(obj.streak) ? obj.streak : stats.streak;
      stats.best   = Number.isFinite(obj.best)   ? obj.best   : stats.best;
      stats.total  = Number.isFinite(obj.total)  ? obj.total  : stats.total;
    }

    function weightFor(key) {
      const entry = combosData[key];
      if (!entry || entry.a === 0) return 1.0;
      const acc = entry.c / entry.a;
      let w = 1.0;
      if (acc < 0.5) w = 1.3;
      else if (acc >= 0.8) w = 0.7;
      if (entry.n > 0 && entry.t / entry.n > 3000) w += 0.2;
      return w;
    }

    function weightedSample(pool) {
      if (!pool.length) return null;
      const weights = pool.map((key) => weightFor(key));
      const total = weights.reduce((s, w) => s + w, 0);
      let r = Math.random() * total;
      for (let i = 0; i < pool.length; i++) {
        r -= weights[i];
        if (r <= 0) return pool[i];
      }
      return pool[pool.length - 1];
    }

    function next() {
      if (!hasSelection()) return null;
      const semis = [...selected];

      let rootPc, semi, attempts = 0;
      if (weakSpotWeighting && Object.keys(combosData).length > 0) {
        const pool = [];
        semis.forEach((s) => {
          for (let pc = 0; pc < 12; pc++) {
            pool.push(pc + ':' + s);
          }
        });
        let key;
        do {
          key = weightedSample(pool);
          if (!key) return null;
          [rootPc, semi] = key.split(':').map(Number);
          attempts++;
        } while (question && rootPc === question.rootPc && attempts < 40);
      } else {
        do {
          semi = semis[Math.floor(Math.random() * semis.length)];
          rootPc = Math.floor(Math.random() * 12);
          attempts++;
        } while (question && rootPc === question.rootPc && attempts < 40);
      }

      const octave = AUDIO_OCTAVES[Math.floor(Math.random() * AUDIO_OCTAVES.length)];
      const audioRootMidi = 12 * (octave + 1) + rootPc; // MIDI for pc in this octave
      const rootDisplay = randomRootName(rootPc);

      question = {
        rootPc,
        semi,
        targetPc: pitchClass(rootPc + semi),
        audioRootMidi,
        audioTargetMidi: audioRootMidi + semi,
        rootDisplay,
        answer: spellName(rootDisplay, rootPc, semi), // { display, accurate } — no octave
        interval: intervalBySemi(semi),
      };
      phase = 'awaiting';
      return question;
    }

    // Judge a played note by pitch class. Returns a result, or null if not awaiting.
    function answer(playedMidi) {
      if (phase !== 'awaiting' || !question) return null;
      phase = 'answered';

      const result = pitchClass(playedMidi) === question.targetPc ? 'correct' : 'wrong';
      stats.total++;
      if (result === 'correct') {
        stats.correct++;
        stats.streak++;
        if (stats.streak > stats.best) stats.best = stats.streak;
      } else {
        stats.wrong++;
        stats.streak = 0;
      }
      return { result, playedMidi, question };
    }

    const accuracy = () => (stats.total ? Math.round((stats.correct / stats.total) * 100) : 0);

    return {
      setMode, setSelected, hasSelection, resetStats, setStats, setCombos, setWeakSpotWeighting, next, answer, accuracy,
      get mode() { return mode; },
      get phase() { return phase; },
      get question() { return question; },
      get stats() { return stats; },
      get weakSpotWeighting() { return weakSpotWeighting; },
    };
  }

  App.createTrainer = createTrainer;
})(window.App = window.App || {});
