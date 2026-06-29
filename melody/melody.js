/* melody.js — scale-degree theory and melody generation (pure logic, no DOM/audio).
 *
 * This trainer practices hearing a melody as RELATIVE SCALE DEGREES in a major
 * key: in C major, C-E-D is 1-3-2. Degrees 1..7 map to the major scale; the
 * actual notes are octave-free pitch classes relative to the key's tonic, so a
 * played answer counts in any octave (matching the interval trainer's model).
 *
 * It builds on the shared theory module (../js/theory.js) for pitch-class math
 * and enharmonic spelling — `spellName` gives each degree its correct letter in
 * the key (G major degree 7 is F♯, not G♭).
 */
(function (App) {
  'use strict';

  const { pitchClass, spellName } = App.theory;

  // Semitones above the tonic for major-scale degrees 1..7 (do, re, mi … ti).
  const MAJOR_OFFSETS = [0, 2, 4, 5, 7, 9, 11];

  // The twelve major keys, ordered round the circle of fifths from C, each with
  // its conventional tonic spelling (the letter that fixes the rest of the key).
  const KEYS = [
    { name: 'C',  pc: 0 },
    { name: 'G',  pc: 7 },
    { name: 'D',  pc: 2 },
    { name: 'A',  pc: 9 },
    { name: 'E',  pc: 4 },
    { name: 'B',  pc: 11 },
    { name: 'F♯', pc: 6 },
    { name: 'D♭', pc: 1 },
    { name: 'A♭', pc: 8 },
    { name: 'E♭', pc: 3 },
    { name: 'B♭', pc: 10 },
    { name: 'F',  pc: 5 },
  ];

  // The note pools an "easier" melody can draw from. `triad` is the tonic
  // arpeggio (do-mi-sol) — the gentlest ear, no half-step tendency tones; `full`
  // is the whole major scale (today's default). Each lists pitch-class degrees
  // 1..7; `degreesForSet` tiles them across the octave(s) actually in play.
  const NOTE_SETS = {
    triad: { label: 'Triad (1·3·5)',   base: [1, 3, 5] },
    full:  { label: 'Full scale (1–7)', base: [1, 2, 3, 4, 5, 6, 7] },
  };

  const keyByName = (name) => KEYS.find((k) => k.name === name) || KEYS[0];

  // A random key from the twelve — used by the "Random key each round" option.
  const randomKey = (rng = Math.random) => KEYS[Math.floor(rng() * KEYS.length)];

  // MIDI note for a degree above a tonic MIDI note. Degrees beyond 7 (e.g. 8 is
  // the octave, 9 a ninth) wrap into higher octaves, so a melody can climb past
  // the one-octave mark when that option is on.
  const degreeToMidi = (tonicMidi, degree) => {
    const idx = degree - 1;
    const octave = Math.floor(idx / 7);
    const within = ((idx % 7) + 7) % 7;
    return tonicMidi + 12 * octave + MAJOR_OFFSETS[within];
  };

  // Fold any degree (an octave-up 8, 9, …) to its pitch-class degree 1..7 — how
  // the answer is judged, since any octave of a note counts.
  const pcDegree = (degree) => (((degree - 1) % 7) + 7) % 7 + 1;

  // Which scale degree a played MIDI note is, relative to the tonic's pitch
  // class — octave-free. Returns 1..7, or null if the note is outside the key
  // (a chromatic note the player fumbled).
  function midiToDegree(midi, tonicPc) {
    const rel = pitchClass(midi - tonicPc);
    const idx = MAJOR_OFFSETS.indexOf(rel);
    return idx === -1 ? null : idx + 1;
  }

  // The note name of a degree within the key, e.g. degreeName(keyByName('G'), 7) -> 'F♯'.
  function degreeName(key, degree) {
    if (degree === 1) return key.name;
    return spellName(key.name, key.pc, MAJOR_OFFSETS[degree - 1]).display;
  }

  // The actual scale degrees a melody may use, given a note set and whether it
  // may climb over the octave. Returns the in-key degrees (e.g. triad -> [1,3,5],
  // or [1,3,5,8] with the octave on) in ascending order — the pool the generator
  // walks. Over-octave extends one octave up, matching the full scale's 1..9.
  function degreesForSet(setName, { overOctave = false } = {}) {
    const base = (NOTE_SETS[setName] || NOTE_SETS.full).base;
    const max = overOctave ? 9 : 7;
    const out = [];
    for (let d = 1; d <= max; d++) {
      if (base.includes(pcDegree(d))) out.push(d);
    }
    return out;
  }

  /* Build a melody as an array of scale degrees of the given length. Lines lean
   * stepwise with the occasional small leap — like real melodies, so they're
   * singable and learnable rather than random scatter — and start on a stable
   * tone (1, 3, or 5).
   *
   * Motion walks the `allowedDegrees` pool by *adjacency within the pool*, not by
   * raw degree, so a triad pool [1,3,5] moves 1→3→5 as "steps" (an arpeggio)
   * rather than as leaps. Options make a melody easier:
   *   allowedDegrees — the note pool to draw from (default: the full scale 1..7).
   *   startOnTonic   — pin the first note to degree 1 for a fixed anchor.
   *   stepwiseOnly   — only move to the adjacent pool tone (no leaps).
   * Degrees are still answered by pitch class. */
  function generateMelody(length, {
    rng = Math.random,
    allowedDegrees = [1, 2, 3, 4, 5, 6, 7],
    startOnTonic = false,
    stepwiseOnly = false,
  } = {}) {
    const pool = allowedDegrees.length ? allowedDegrees : [1];
    const top = pool.length - 1;

    // Where to begin: the tonic when pinned, else a stable tone (1/3/5) that's
    // actually in the pool, else the lowest available tone.
    let idx;
    if (startOnTonic && pool.includes(1)) {
      idx = pool.indexOf(1);
    } else {
      const stable = [1, 3, 5].filter((d) => pool.includes(d));
      const pick = stable.length ? stable[Math.floor(rng() * stable.length)] : pool[0];
      idx = pool.indexOf(pick);
    }

    const degrees = [pool[idx]];
    for (let i = 1; i < length; i++) {
      if (top === 0) { degrees.push(pool[0]); continue; }
      let next;
      do {
        let span;
        if (stepwiseOnly) {
          span = 1;                                      // adjacent pool tone only
        } else {
          const r = rng();
          if (r < 0.6) span = 1;                         // a step (most common)
          else if (r < 0.85) span = 2;                   // a skip
          else span = 3;                                 // a wider leap
        }
        next = idx + (rng() < 0.5 ? -span : span);
      } while (next < 0 || next > top);
      idx = next;
      degrees.push(pool[idx]);
    }
    return degrees;
  }

  App.melody = {
    MAJOR_OFFSETS,
    KEYS,
    NOTE_SETS,
    keyByName,
    randomKey,
    degreeToMidi,
    pcDegree,
    midiToDegree,
    degreeName,
    degreesForSet,
    generateMelody,
  };
})(window.App = window.App || {});
