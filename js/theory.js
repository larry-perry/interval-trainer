/* theory.js — notes, intervals, frequencies, and correct enharmonic spelling.
 *
 * Pitch model: MIDI note numbers (C4 = 60, A4 = 69 = 440 Hz). The app practices
 * by PITCH CLASS — "which note", any octave — so most naming here is octave-free.
 * Enharmonic spelling (adapted from the original TuTempo trainer) counts LETTER
 * steps from the root's displayed letter, then adds whatever accidental makes the
 * pitch class match (so a minor 3rd above C is E♭, not D♯).
 */
(function (App) {
  'use strict';

  const NOTE_NAMES_SHARP = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const NOTE_NAMES_FLAT  = ['C', 'D♭', 'D', 'E♭', 'E', 'F', 'G♭', 'G', 'A♭', 'A', 'B♭', 'B'];

  const LETTER_NAMES = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
  const LETTER_TO_PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

  // Simple intervals m2..M7. The octave (P8) is intentionally excluded: in a
  // pitch-class world it's degenerate (same note name as the root).
  const INTERVALS = [
    { semi: 1,  name: 'm2', label: 'Minor 2nd' },
    { semi: 2,  name: 'M2', label: 'Major 2nd' },
    { semi: 3,  name: 'm3', label: 'Minor 3rd' },
    { semi: 4,  name: 'M3', label: 'Major 3rd' },
    { semi: 5,  name: 'P4', label: 'Perfect 4th' },
    { semi: 6,  name: 'TT', label: 'Tritone' },
    { semi: 7,  name: 'P5', label: 'Perfect 5th' },
    { semi: 8,  name: 'm6', label: 'Minor 6th' },
    { semi: 9,  name: 'M6', label: 'Major 6th' },
    { semi: 10, name: 'm7', label: 'Minor 7th' },
    { semi: 11, name: 'M7', label: 'Major 7th' },
  ];

  // Letter span of each interval (m2/M2 -> 1 letter, m3/M3 -> 2 letters, ...).
  const INTERVAL_LETTER_STEPS = { 1: 1, 2: 1, 3: 2, 4: 2, 5: 3, 6: 3, 7: 4, 8: 5, 9: 5, 10: 6, 11: 6 };

  const intervalBySemi = (semi) => INTERVALS.find((iv) => iv.semi === semi);

  const midiToFreq = (m) => 440 * Math.pow(2, (m - 69) / 12);
  const freqToMidi = (f) => 69 + 12 * Math.log2(f / 440); // fractional MIDI number
  const pitchClass = (m) => ((m % 12) + 12) % 12;
  const octaveOf = (m) => Math.floor(m / 12) - 1; // MIDI 60 -> octave 4
  const isBlack = (pc) => [1, 3, 6, 8, 10].includes(pitchClass(pc));

  // Octave-free name of a pitch class, e.g. pcName(3) -> "D#", pcName(3,{flat}) -> "E♭".
  const pcName = (pc, { flat = false } = {}) => (flat ? NOTE_NAMES_FLAT : NOTE_NAMES_SHARP)[pitchClass(pc)];

  // Plain name WITH octave, used for the "note you played" readout: midiName(61) -> "C#4".
  const midiName = (m, { flat = false } = {}) => pcName(m, { flat }) + octaveOf(m);

  // A root name for display: natural for white keys, random sharp/flat for black.
  function randomRootName(pc) {
    pc = pitchClass(pc);
    if (!isBlack(pc)) return NOTE_NAMES_SHARP[pc];
    return Math.random() < 0.5 ? NOTE_NAMES_SHARP[pc] : NOTE_NAMES_FLAT[pc];
  }

  /* Spell the note `semi` semitones above a root (octave-free), given the root's
   * displayed name (which fixes its letter). Returns { display, accurate } where
   * `accurate` is a double-accidental spelling offered when `display` is a
   * simplified enharmonic. */
  function spellName(rootDisplay, rootPc, semi) {
    const rootLetterIdx = LETTER_NAMES.indexOf(rootDisplay.charAt(0));
    const targetLetter = LETTER_NAMES[(rootLetterIdx + INTERVAL_LETTER_STEPS[semi]) % 7];
    const targetPc = pitchClass(rootPc + semi);
    const naturalPc = LETTER_TO_PC[targetLetter];

    let diff = targetPc - naturalPc;
    if (diff > 6) diff -= 12;
    if (diff < -6) diff += 12;

    let proper;
    if (diff === 0) proper = targetLetter;
    else if (diff === 1) proper = targetLetter + '#';
    else if (diff === -1) proper = targetLetter + '♭';
    else if (diff === 2) proper = targetLetter + '##';
    else if (diff === -2) proper = targetLetter + '♭♭';
    else proper = targetLetter;

    if (diff === 2 || diff === -2) {
      let simple = NOTE_NAMES_SHARP[targetPc];
      if (simple === proper) simple = NOTE_NAMES_FLAT[targetPc];
      return { display: simple, accurate: proper };
    }
    return { display: proper, accurate: null };
  }

  App.theory = {
    NOTE_NAMES_SHARP,
    NOTE_NAMES_FLAT,
    INTERVALS,
    intervalBySemi,
    midiToFreq,
    freqToMidi,
    pitchClass,
    octaveOf,
    isBlack,
    pcName,
    midiName,
    randomRootName,
    spellName,
  };
})(window.App = window.App || {});
