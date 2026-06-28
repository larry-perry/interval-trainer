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

  const keyByName = (name) => KEYS.find((k) => k.name === name) || KEYS[0];

  // MIDI note for a degree above a tonic MIDI note (degrees stay within one
  // octave, so the contour reads directly off the numbers).
  const degreeToMidi = (tonicMidi, degree) => tonicMidi + MAJOR_OFFSETS[degree - 1];

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

  /* Build a melody as an array of scale degrees (1..7) of the given length.
   * Lines lean stepwise with the occasional small leap — like real melodies, so
   * they're singable and learnable rather than random scatter — and start on a
   * stable tone (1, 3, or 5). All motion is kept inside the 1..7 octave. */
  function generateMelody(length, { rng = Math.random } = {}) {
    const stableStarts = [1, 1, 3, 5];
    let prev = stableStarts[Math.floor(rng() * stableStarts.length)];
    const degrees = [prev];

    for (let i = 1; i < length; i++) {
      let next;
      do {
        const r = rng();
        let step;
        if (r < 0.6) step = rng() < 0.5 ? -1 : 1;        // step (most common)
        else if (r < 0.85) step = rng() < 0.5 ? -2 : 2;  // a third
        else step = rng() < 0.5 ? -3 : 3;                // a wider leap
        next = prev + step;
      } while (next < 1 || next > 7);
      degrees.push(next);
      prev = next;
    }
    return degrees;
  }

  App.melody = {
    MAJOR_OFFSETS,
    KEYS,
    keyByName,
    degreeToMidi,
    midiToDegree,
    degreeName,
    generateMelody,
  };
})(window.App = window.App || {});
