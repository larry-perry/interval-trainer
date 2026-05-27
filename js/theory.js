/* theory.js — notes, intervals, frequencies, and correct enharmonic spelling.
 *
 * Pitch model: MIDI note numbers. C4 = 60 (middle C), A4 = 69 = 440 Hz.
 * The enharmonic-spelling logic is adapted from the original TuTempo interval
 * trainer: an interval is spelled by counting LETTER steps from the root's
 * displayed letter, then adding whatever accidental makes the pitch class match.
 */
(function (App) {
  'use strict';

  const NOTE_NAMES_SHARP = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const NOTE_NAMES_FLAT  = ['C', 'D♭', 'D', 'E♭', 'E', 'F', 'G♭', 'G', 'A♭', 'A', 'B♭', 'B'];

  const LETTER_NAMES = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
  const LETTER_TO_PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

  // Intervals by semitone distance (1 = minor 2nd … 12 = octave).
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
    { semi: 12, name: 'P8', label: 'Octave' },
  ];

  // How many letter names an interval spans (m2/M2 -> 1 letter, etc.).
  const INTERVAL_LETTER_STEPS = {
    1: 1, 2: 1, 3: 2, 4: 2, 5: 3, 6: 3, 7: 4, 8: 5, 9: 5, 10: 6, 11: 6, 12: 7,
  };

  const intervalBySemi = (semi) => INTERVALS.find((iv) => iv.semi === semi);

  const midiToFreq = (m) => 440 * Math.pow(2, (m - 69) / 12);
  const freqToMidi = (f) => 69 + 12 * Math.log2(f / 440); // fractional MIDI number
  const pitchClass = (m) => ((m % 12) + 12) % 12;
  const octaveOf = (m) => Math.floor(m / 12) - 1; // MIDI 60 -> octave 4
  const isBlack = (m) => [1, 3, 6, 8, 10].includes(pitchClass(m));

  // Plain name with octave, e.g. midiName(60) -> "C4", midiName(61,{flat:true}) -> "D♭4".
  function midiName(m, { flat = false } = {}) {
    const names = flat ? NOTE_NAMES_FLAT : NOTE_NAMES_SHARP;
    return names[pitchClass(m)] + octaveOf(m);
  }

  function extractLetter(displayName) {
    return displayName.charAt(0);
  }

  /* Spell the note `semi` semitones above `rootMidi`, given the root's displayed
   * name (which fixes its letter). Returns { display, accurate } where `accurate`
   * is a double-accidental spelling offered only when `display` is a simplified
   * enharmonic. Octave numbers are appended to both. */
  function spellAbove(rootMidi, rootDisplay, semi) {
    const rootPc = pitchClass(rootMidi);
    const targetMidi = rootMidi + semi;
    const targetPc = pitchClass(targetMidi);
    const targetOct = octaveOf(targetMidi);

    const rootLetter = extractLetter(rootDisplay);
    const rootLetterIdx = LETTER_NAMES.indexOf(rootLetter);
    const letterSteps = INTERVAL_LETTER_STEPS[semi];
    const targetLetter = LETTER_NAMES[(rootLetterIdx + letterSteps) % 7];

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
      // Double-accidental: show a simpler enharmonic, keep the accurate one too.
      let simple = NOTE_NAMES_SHARP[targetPc];
      if (simple === proper) simple = NOTE_NAMES_FLAT[targetPc];
      return { display: simple + targetOct, accurate: proper + targetOct };
    }
    return { display: proper + targetOct, accurate: null };
  }

  // A display name for a root, randomly choosing sharp/flat for black keys.
  function rootDisplayName(rootMidi) {
    const pc = pitchClass(rootMidi);
    const oct = octaveOf(rootMidi);
    if (!isBlack(rootMidi)) return NOTE_NAMES_SHARP[pc] + oct;
    return (Math.random() < 0.5 ? NOTE_NAMES_SHARP[pc] : NOTE_NAMES_FLAT[pc]) + oct;
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
    midiName,
    spellAbove,
    rootDisplayName,
  };
})(window.App = window.App || {});
