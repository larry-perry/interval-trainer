/* app.js — wiring for the Melody Trainer: DOM + melody engine + audio + input.
 *
 * Loop: pick a key and length, hear a short melody, then answer its scale
 * degrees in order — either by tapping the 1..7 number pad, or by playing the
 * notes (USB MIDI / mic / on-screen keyboard), which are read as degrees by
 * pitch class relative to the tonic. Each entered note is checked against the
 * expected degree as you go; the phrase is revealed when it's complete.
 */
(function (App) {
  'use strict';

  const { audio, theory, melody: M, createPiano, createInputManager } = App;
  const $ = (id) => document.getElementById(id);

  /* ---------- persistent settings + running stats ---------- */
  const STORE_KEY = 'melodyTrainer.v1';
  const defaults = {
    keyName: 'C',
    length: 4,
    answerMode: 'numbers', // 'numbers' | 'play'
    autoAdvance: true,
    overOctave: false,     // let melodies climb past the one-octave mark
    noteSet: 'full',       // 'full' (1–7) | 'triad' (1·3·5) — the easy-mode pool
    startOnTonic: false,   // pin the first note to degree 1
    stepwiseOnly: false,   // move only to the adjacent pool tone (no leaps)
    slowReplay: false,     // play slower and auto-replay once
    drone: false,          // sound the key reference as a quiet sustained drone
    stats: { correct: 0, wrong: 0, streak: 0, notesRight: 0, notesTotal: 0 },
  };
  let settings = load();

  function load() {
    try {
      const raw = JSON.parse(localStorage.getItem(STORE_KEY));
      if (raw && typeof raw === 'object') {
        return { ...defaults, ...raw, stats: { ...defaults.stats, ...(raw.stats || {}) } };
      }
    } catch (_) { /* ignore corrupt storage */ }
    return JSON.parse(JSON.stringify(defaults));
  }
  function save() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(settings)); } catch (_) { /* ignore */ }
  }

  /* ---------- DOM ---------- */
  const els = {
    keySelect: $('keySelect'),
    lengthRange: $('lengthRange'),
    lengthValue: $('lengthValue'),
    answerSwitch: $('answerSwitch'),
    noteSetSelect: $('noteSetSelect'),
    autoAdvance: $('autoAdvance'),
    overOctave: $('overOctave'),
    startOnTonic: $('startOnTonic'),
    stepwiseOnly: $('stepwiseOnly'),
    slowReplay: $('slowReplay'),
    drone: $('drone'),
    ioRow: $('ioRow'),
    midiDot: $('midiDot'),
    midiText: $('midiText'),
    midiSelect: $('midiSelect'),
    micBtn: $('micBtn'),
    liveNote: $('liveNote'),
    liveLabel: $('liveLabel'),
    keyLabel: $('keyLabel'),
    progress: $('progress'),
    actionBtn: $('actionBtn'),
    replayBtn: $('replayBtn'),
    keyRefBtn: $('keyRefBtn'),
    clearBtn: $('clearBtn'),
    resetBtn: $('resetBtn'),
    inputLabel: $('inputLabel'),
    numberPad: $('numberPad'),
    pianoWrapper: $('pianoWrapper'),
    statCorrect: $('statCorrect'),
    statWrong: $('statWrong'),
    statStreak: $('statStreak'),
    statAccuracy: $('statAccuracy'),
  };

  /* ---------- round state ---------- */
  let key = M.keyByName(settings.keyName);
  let tonicMidi = 60 + key.pc;          // a comfortable tonic in the C4..B4 range
  let melodyDegrees = [];               // the current phrase, e.g. [1, 3, 2]
  let entries = [];                     // what the player has answered so far
  let pos = 0;                          // index of the next expected note
  let phase = 'idle';                   // 'idle' | 'prompt' | 'answering' | 'revealed'
  let midiInited = false;

  const input = createInputManager();
  let piano = null;

  /* ---------- setup the static controls ---------- */
  function buildKeySelect() {
    els.keySelect.innerHTML = '';
    const rnd = document.createElement('option');
    rnd.value = 'random';
    rnd.textContent = 'Random key';
    els.keySelect.appendChild(rnd);
    M.KEYS.forEach((k) => {
      const opt = document.createElement('option');
      opt.value = k.name;
      opt.textContent = `${k.name} major`;
      els.keySelect.appendChild(opt);
    });
    els.keySelect.value = settings.keyName;
  }

  function buildNoteSetSelect() {
    els.noteSetSelect.innerHTML = '';
    Object.entries(M.NOTE_SETS).forEach(([value, { label }]) => {
      const opt = document.createElement('option');
      opt.value = value;
      opt.textContent = label;
      els.noteSetSelect.appendChild(opt);
    });
    els.noteSetSelect.value = settings.noteSet;
  }

  function buildNumberPad() {
    els.numberPad.innerHTML = '';
    for (let d = 1; d <= 7; d++) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'num-btn';
      btn.dataset.degree = d;
      btn.innerHTML = `<span class="num">${d}</span><span class="num-name" data-degree="${d}"></span>`;
      btn.addEventListener('click', () => submitDegree(d, { source: 'pad' }));
      els.numberPad.appendChild(btn);
    }
    refreshPadNames();
  }

  // Show each pad key's note name in the current key (1 -> C, 3 -> E, …).
  function refreshPadNames() {
    els.numberPad.querySelectorAll('.num-name').forEach((span) => {
      span.textContent = M.degreeName(key, Number(span.dataset.degree));
    });
  }

  function buildPiano() {
    piano = createPiano(els.pianoWrapper, {
      low: 60, high: 84,
      onPlay: (midi) => input.feedScreenNote(midi),
    });
  }

  /* ---------- progress display (one chip per note in the phrase) ---------- */
  function buildProgress() {
    els.progress.innerHTML = '';
    for (let i = 0; i < melodyDegrees.length; i++) {
      const chip = document.createElement('div');
      chip.className = 'slot';
      chip.innerHTML = '<span class="slot-deg">·</span><span class="slot-name"></span>';
      els.progress.appendChild(chip);
    }
    markActiveSlot();
  }

  function markActiveSlot() {
    [...els.progress.children].forEach((chip, i) => {
      chip.classList.toggle('is-active', i === pos && phase === 'answering');
    });
  }

  function fillSlot(i, { entered, correct, expected, reveal = false }) {
    const chip = els.progress.children[i];
    if (!chip) return;
    const deg = chip.querySelector('.slot-deg');
    const name = chip.querySelector('.slot-name');
    chip.classList.remove('is-active');
    if (reveal) {
      // Show the answer key once the phrase is done.
      deg.textContent = expected;
      name.textContent = M.degreeName(key, expected);
      chip.classList.add(correct ? 'is-correct' : 'is-wrong');
      if (!correct) chip.classList.add('is-revealed');
      return;
    }
    deg.textContent = entered == null ? '?' : entered;
    name.textContent = entered == null ? '' : M.degreeName(key, entered);
    chip.classList.add(correct ? 'is-correct' : 'is-wrong');
  }

  /* ---------- the round ---------- */
  function currentMelodyMidis() {
    return melodyDegrees.map((d) => M.degreeToMidi(tonicMidi, d));
  }

  // Sound the key's tonal centre. By default this is a struck I chord; with the
  // "Drone reference" option on it's a quiet sustained tonic-and-fifth drone.
  // `holdFor` lets a caller (the melody playback) stretch the drone so it holds
  // under the whole line; the standalone "Key ♪" button uses a short default.
  function soundKeyRef({ holdFor = 2.4 } = {}) {
    if (settings.drone) {
      const dur = audio.playDrone([tonicMidi, tonicMidi + 7], holdFor);
      input.suppressMic(dur * 1000 + 200);
    } else {
      audio.playChord([tonicMidi, tonicMidi + 4, tonicMidi + 7], 0.75);
      input.suppressMic(900);
    }
  }

  function playMelody({ withKeyRef = false } = {}) {
    if (!melodyDegrees.length) return;
    // The "Slower + replay" helper lengthens each note and plays the line a
    // second time after a short breath, so a beginner gets two passes to track.
    const slow = settings.slowReplay;
    const noteDur = slow ? 0.7 : 0.45;
    const gap = slow ? 0.18 : 0.12;
    const midis = currentMelodyMidis();

    let startDelay = 0;
    if (withKeyRef) {
      if (settings.drone) {
        // A drone comes in fast and holds *under* the line rather than ringing
        // out before it — so just a short breath, then keep it sounding through
        // both passes of the melody.
        startDelay = 0.55;
        const passes = slow ? 2 : 1;
        const lineTime = midis.length * (noteDur + gap) * passes + (slow ? 0.6 : 0);
        soundKeyRef({ holdFor: startDelay + lineTime + 0.4 });
      } else {
        soundKeyRef();
        startDelay = 0.95; // let the chord ring before the line starts
      }
    }
    let total = audio.playSequence(midis, { noteDur, gap, startDelay });
    if (slow) {
      total = audio.playSequence(midis, { noteDur, gap, startDelay: total + 0.6 });
    }
    input.suppressMic(total * 1000 + 250);
  }

  // The key for a round: a fresh random one each time when "Random key" is
  // chosen, otherwise the fixed key from the dropdown.
  function pickKeyForRound() {
    return settings.keyName === 'random' ? M.randomKey() : M.keyByName(settings.keyName);
  }

  function newMelody() {
    key = pickKeyForRound();
    tonicMidi = 60 + key.pc;
    melodyDegrees = M.generateMelody(settings.length, {
      allowedDegrees: M.degreesForSet(settings.noteSet, { overOctave: settings.overOctave }),
      startOnTonic: settings.startOnTonic,
      stepwiseOnly: settings.stepwiseOnly,
    });
    entries = [];
    pos = 0;
    phase = 'answering';

    els.keyLabel.textContent = `Key of ${key.name} major`;
    buildProgress();
    refreshPadNames();
    setReadout('—', 'listen, then answer the numbers');

    els.replayBtn.disabled = false;
    els.keyRefBtn.disabled = false;
    els.clearBtn.disabled = false;
    els.actionBtn.textContent = 'New melody';

    playMelody({ withKeyRef: true });
  }

  function clearEntry() {
    if (!melodyDegrees.length) return;
    entries = [];
    pos = 0;
    phase = 'answering';
    buildProgress();
    setReadout('—', 'entry cleared — answer again');
    if (piano) piano.clear();
  }

  function submitDegree(degree, { source = 'pad', midi = null } = {}) {
    if (phase !== 'answering') return;

    // Judge by pitch class: an octave-up note (degree 8/9) is answered as 1/2.
    const expected = M.pcDegree(melodyDegrees[pos]);
    const correct = degree === expected;
    entries[pos] = degree;
    fillSlot(pos, { entered: degree, correct });

    // Live readout: what you answered, and whether it landed.
    const ans = degree == null ? '?' : `${degree} (${M.degreeName(key, degree)})`;
    if (midi != null) {
      setReadout(theory.midiName(midi), `${ans} ${correct ? '✓' : '✗'}`);
      if (piano && piano.has(midi)) piano.flash(midi, correct ? 'is-correct' : 'is-wrong');
      else if (piano) piano.flashPc(theory.pitchClass(midi), correct ? 'is-correct' : 'is-wrong');
    } else {
      setReadout(degree == null ? '?' : String(degree), `${M.degreeName(key, degree)} ${correct ? '✓' : '✗'}`);
    }

    pos++;
    markActiveSlot();
    if (pos >= melodyDegrees.length) finishPhrase();
  }

  function finishPhrase() {
    phase = 'revealed';

    let notesRight = 0;
    melodyDegrees.forEach((raw, i) => {
      const expected = M.pcDegree(raw);
      const correct = entries[i] === expected;
      if (correct) notesRight++;
      fillSlot(i, { correct, expected, reveal: true });
    });
    const perfect = notesRight === melodyDegrees.length;

    const s = settings.stats;
    if (perfect) { s.correct++; s.streak++; } else { s.wrong++; s.streak = 0; }
    s.notesRight += notesRight;
    s.notesTotal += melodyDegrees.length;
    save();
    renderStats();

    const numbers = melodyDegrees.map(M.pcDegree).join(' ');
    setReadout(perfect ? '✓' : `${notesRight}/${melodyDegrees.length}`,
      perfect ? `nailed it — ${numbers}` : `it was ${numbers}`);

    if (settings.autoAdvance) {
      setTimeout(() => { if (phase === 'revealed') newMelody(); }, 1600);
    }
  }

  function setReadout(note, label) {
    els.liveNote.textContent = note;
    els.liveLabel.textContent = label;
  }

  function renderStats() {
    const s = settings.stats;
    els.statCorrect.textContent = s.correct;
    els.statWrong.textContent = s.wrong;
    els.statStreak.textContent = s.streak;
    const pct = s.notesTotal ? Math.round((s.notesRight / s.notesTotal) * 100) : 0;
    els.statAccuracy.textContent = `${pct}%`;
  }

  /* ---------- answer-mode switching (numbers vs play) ---------- */
  function setAnswerMode(mode) {
    settings.answerMode = mode;
    save();
    [...els.answerSwitch.children].forEach((b) => b.classList.toggle('active', b.dataset.answer === mode));

    const playing = mode === 'play';
    els.numberPad.hidden = playing;
    els.pianoWrapper.hidden = !playing;
    els.ioRow.hidden = !playing;
    els.inputLabel.textContent = playing ? 'Play the melody — MIDI, mic, or the keys' : 'Tap the scale numbers';

    if (playing) {
      if (!piano) buildPiano();
      initMIDIOnce();
    }
  }

  /* ---------- input plumbing (shared by all sources) ---------- */
  input.on('noteon', ({ midi, source }) => {
    if (settings.answerMode !== 'play') return;
    const degree = M.midiToDegree(midi, key.pc);
    submitDegree(degree, { source, midi });
  });

  input.on('pitch', ({ midi, cents }) => {
    if (settings.answerMode !== 'play' || phase !== 'answering') return;
    // Light touch live feedback while a note is being found via the mic.
    if (Math.abs(cents) <= 35 && piano) piano.flashPc(theory.pitchClass(midi), 'is-active', 120);
  });

  input.on('status', renderMidiStatus);
  input.on('deviceschanged', renderMidiDevices);

  async function initMIDIOnce() {
    if (midiInited) return;
    midiInited = true;
    if (!input.midiSupported()) { renderMidiStatus({ status: 'unsupported' }); return; }
    els.midiText.textContent = 'Connecting…';
    await input.initMIDI();
  }

  function renderMidiStatus({ status }) {
    const map = {
      ready: ['ok', 'MIDI ready'],
      unsupported: ['bad', 'No Web MIDI'],
      denied: ['bad', 'MIDI blocked'],
      error: ['bad', 'MIDI error'],
      'mic-ready': ['ok', 'Mic on'],
      'mic-denied': ['bad', 'Mic blocked'],
      'mic-error': ['bad', 'Mic error'],
      'mic-unsupported': ['bad', 'No mic'],
      'mic-off': ['ok', 'MIDI ready'],
    };
    const [dot, text] = map[status] || ['', '…'];
    els.midiDot.className = `dot ${dot}`;
    if (text) els.midiText.textContent = text;
  }

  function renderMidiDevices(devices) {
    if (!devices || !devices.length) {
      els.midiSelect.style.display = 'none';
      return;
    }
    els.midiSelect.style.display = '';
    els.midiSelect.innerHTML = '';
    const all = document.createElement('option');
    all.value = 'all'; all.textContent = 'All inputs';
    els.midiSelect.appendChild(all);
    devices.forEach((d) => {
      const opt = document.createElement('option');
      opt.value = d.id; opt.textContent = d.name;
      els.midiSelect.appendChild(opt);
    });
    els.midiSelect.value = input.selectedDeviceId;
  }

  /* ---------- events ---------- */
  els.keySelect.addEventListener('change', () => {
    settings.keyName = els.keySelect.value;
    save();
    if (settings.keyName === 'random') {
      // The actual key is drawn when the next melody starts; until then keep the
      // current pad names and just say what's coming.
      els.keyLabel.textContent = 'Random key each round';
      return;
    }
    key = M.keyByName(settings.keyName);
    tonicMidi = 60 + key.pc;
    refreshPadNames();
    els.keyLabel.textContent = `Key of ${key.name} major`;
  });

  els.lengthRange.addEventListener('input', () => {
    settings.length = Number(els.lengthRange.value);
    els.lengthValue.textContent = settings.length;
    save();
  });

  els.answerSwitch.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-answer]');
    if (btn) setAnswerMode(btn.dataset.answer);
  });

  els.autoAdvance.addEventListener('change', () => {
    settings.autoAdvance = els.autoAdvance.checked;
    save();
  });

  els.overOctave.addEventListener('change', () => {
    settings.overOctave = els.overOctave.checked;
    save();
  });

  els.noteSetSelect.addEventListener('change', () => {
    settings.noteSet = els.noteSetSelect.value;
    save();
  });

  els.startOnTonic.addEventListener('change', () => {
    settings.startOnTonic = els.startOnTonic.checked;
    save();
  });

  els.stepwiseOnly.addEventListener('change', () => {
    settings.stepwiseOnly = els.stepwiseOnly.checked;
    save();
  });

  els.slowReplay.addEventListener('change', () => {
    settings.slowReplay = els.slowReplay.checked;
    save();
  });

  els.drone.addEventListener('change', () => {
    settings.drone = els.drone.checked;
    save();
  });

  els.actionBtn.addEventListener('click', () => { audio.ensure(); newMelody(); });
  els.replayBtn.addEventListener('click', () => playMelody());
  els.keyRefBtn.addEventListener('click', () => soundKeyRef());
  els.clearBtn.addEventListener('click', clearEntry);
  els.resetBtn.addEventListener('click', () => {
    settings.stats = JSON.parse(JSON.stringify(defaults.stats));
    save();
    renderStats();
  });

  els.micBtn.addEventListener('click', async () => {
    if (input.micActive) { input.stopMic(); els.micBtn.textContent = 'Use microphone'; return; }
    await audio.resumeIfNeeded();
    const res = await input.initMic();
    els.micBtn.textContent = res.supported ? 'Stop microphone' : 'Use microphone';
  });

  els.midiSelect.addEventListener('change', () => input.selectDevice(els.midiSelect.value));

  /* ---------- init ---------- */
  buildKeySelect();
  buildNoteSetSelect();
  buildNumberPad();
  els.lengthRange.value = settings.length;
  els.lengthValue.textContent = settings.length;
  els.autoAdvance.checked = settings.autoAdvance;
  els.overOctave.checked = settings.overOctave;
  els.startOnTonic.checked = settings.startOnTonic;
  els.stepwiseOnly.checked = settings.stepwiseOnly;
  els.slowReplay.checked = settings.slowReplay;
  els.drone.checked = settings.drone;
  els.keyLabel.textContent = settings.keyName === 'random'
    ? 'Random key each round'
    : `Key of ${key.name} major`;
  renderStats();
  setAnswerMode(settings.answerMode);
})(window.App = window.App || {});
