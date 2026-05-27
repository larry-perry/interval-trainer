/* app.js — wiring. Connects the trainer engine to the DOM, audio, the
 * on-screen keyboard, and the unified input manager. */
(function (App) {
  'use strict';

  const { theory, audio, createTrainer, createInputManager, createPiano } = App;
  const $ = (sel) => document.querySelector(sel);

  const els = {
    modeBtns: [...document.querySelectorAll('.mode-btn')],
    intervalSelector: $('#intervalSelector'),
    prompt: $('#prompt'),
    liveNote: $('#liveNote'),
    liveLabel: $('#liveLabel'),
    statCorrect: $('#statCorrect'),
    statWrong: $('#statWrong'),
    statStreak: $('#statStreak'),
    statAccuracy: $('#statAccuracy'),
    pianoWrapper: $('#pianoWrapper'),
    actionBtn: $('#actionBtn'),
    replayBtn: $('#replayBtn'),
    midiSelect: $('#midiSelect'),
    midiDot: $('#midiDot'),
    midiText: $('#midiText'),
    micBtn: $('#micBtn'),
    autoAdvance: $('#autoAdvance'),
  };

  const AUTO_ADVANCE_MS = 1100; // ~1s after a correct answer, per request
  let advanceTimer = null;
  const clearAdvance = () => { if (advanceTimer) { clearTimeout(advanceTimer); advanceTimer = null; } };

  // Play a prompt and deafen the mic for the playback window so the speakers
  // aren't mistaken for the player. Durations cover note + release tails.
  const SUPPRESS = { root: 1000, melodic: 1700, harmonic: 1400 };
  function play(q, style) {
    audio.playInterval(q.rootMidi, q.semi, style);
    input.suppressMic(SUPPRESS[style] || 1000);
  }

  const trainer = createTrainer();
  const input = createInputManager();
  const selected = new Set(); // nothing selected by default — the player chooses

  const piano = createPiano(els.pianoWrapper, {
    low: 48, high: 84,
    onPlay: (midi) => { audio.ensure(); input.feedScreenNote(midi); },
  });

  /* ---------- interval selector ---------- */
  theory.INTERVALS.forEach((iv) => {
    const btn = document.createElement('button');
    btn.className = 'interval-btn';
    btn.type = 'button';
    btn.textContent = iv.name;
    btn.title = iv.label;
    btn.dataset.semi = iv.semi;
    if (selected.has(iv.semi)) btn.classList.add('active');
    btn.addEventListener('click', () => {
      if (selected.has(iv.semi)) selected.delete(iv.semi);
      else selected.add(iv.semi);
      btn.classList.toggle('active');
      trainer.setSelected(selected);
      syncActionEnabled();
    });
    els.intervalSelector.appendChild(btn);
  });
  trainer.setSelected(selected);

  /* ---------- mode toggle ---------- */
  els.modeBtns.forEach((b) => {
    b.addEventListener('click', () => {
      els.modeBtns.forEach((x) => x.classList.toggle('active', x === b));
      trainer.setMode(b.dataset.mode);
      if (trainer.phase === 'idle') showIdlePrompt();
    });
  });

  /* ---------- helpers ---------- */
  function syncActionEnabled() {
    els.actionBtn.disabled = !trainer.hasSelection();
  }

  function setLive(midi) {
    els.liveNote.textContent = theory.midiName(midi);
    els.liveLabel.textContent = 'last played';
  }

  function renderStats() {
    const s = trainer.stats;
    els.statCorrect.textContent = s.correct;
    els.statWrong.textContent = s.wrong;
    els.statStreak.textContent = s.streak;
    els.statAccuracy.textContent = trainer.accuracy() + '%';
  }

  function showIdlePrompt() {
    els.prompt.className = 'prompt';
    const verb = trainer.mode === 'ear' ? 'Listen, then play what you hear' : 'Play the named interval';
    els.prompt.innerHTML = `
      <div class="prompt-kicker">${trainer.mode === 'ear' ? 'Ear training' : 'Interval reading'}</div>
      <div class="prompt-idle">${verb}.<br>Pick intervals below and press <strong>Start</strong>.</div>`;
  }

  /* ---------- question flow ---------- */
  function startQuestion() {
    clearAdvance();
    const q = trainer.next();
    if (!q) return;
    audio.ensure();
    piano.clear();
    if (piano.has(q.rootMidi)) piano.highlight(q.rootMidi, 'is-root');

    if (trainer.mode === 'ear') {
      els.prompt.className = 'prompt';
      els.prompt.innerHTML = `
        <div class="prompt-kicker">Ear training</div>
        <div class="prompt-root">root <strong>${q.rootDisplay}</strong></div>
        <div class="prompt-task">Play the note you hear above it.</div>`;
      play(q, 'melodic');
    } else {
      els.prompt.className = 'prompt';
      els.prompt.innerHTML = `
        <div class="prompt-kicker">Play this interval</div>
        <div class="prompt-root">${q.rootDisplay}</div>
        <div class="prompt-task"><strong>${q.interval.label}</strong> above <span class="muted">(${q.interval.name})</span></div>`;
      play(q, 'root');
    }

    els.replayBtn.disabled = false;
    els.actionBtn.textContent = 'Next';
    renderStats();
  }

  function judge(playedMidi) {
    const res = trainer.answer(playedMidi);
    if (!res) return;
    const q = res.question;

    piano.clear('is-active');
    if (piano.has(q.targetMidi)) piano.highlight(q.targetMidi, 'is-target');

    const answerText = q.answer.accurate
      ? `${q.answer.display} <span class="muted">(more precisely ${q.answer.accurate})</span>`
      : q.answer.display;
    const nameReveal = trainer.mode === 'ear'
      ? ` — that was a <strong>${q.interval.label}</strong>`
      : '';

    if (res.result === 'wrong') {
      els.prompt.className = 'prompt wrong';
      if (piano.has(playedMidi)) piano.highlight(playedMidi, 'is-wrong');
      els.prompt.innerHTML = `
        <div class="prompt-kicker">Not quite</div>
        <div class="prompt-result">The answer was <strong>${answerText}</strong>${nameReveal}.</div>
        <div class="prompt-task muted">You played ${theory.midiName(playedMidi)}.</div>`;
    } else {
      els.prompt.className = 'prompt correct';
      if (piano.has(playedMidi)) piano.highlight(playedMidi, 'is-correct');
      const octaveNote = res.result === 'octave'
        ? ' <span class="muted">(right note, different octave)</span>'
        : '';
      els.prompt.innerHTML = `
        <div class="prompt-kicker">Correct</div>
        <div class="prompt-result"><strong>${answerText}</strong>${nameReveal}${octaveNote}</div>`;
      play(q, 'harmonic');
      if (els.autoAdvance.checked) advanceTimer = setTimeout(startQuestion, AUTO_ADVANCE_MS);
    }
    renderStats();
  }

  /* ---------- input events ---------- */
  input.on('noteon', ({ midi, source }) => {
    audio.ensure();
    setLive(midi);
    piano.flash(midi, 'is-active');
    if (trainer.phase !== 'awaiting') return;

    // Playing the root is "free" — it lets you orient without being judged.
    // For the octave (P8) the target shares the root's pitch class, so only the
    // exact root note is free there; otherwise any octave of the root counts.
    const q = trainer.question;
    const isRoot = midi === q.rootMidi ||
      (q.semi !== 12 && theory.pitchClass(midi) === theory.pitchClass(q.rootMidi));
    if (isRoot) {
      if (source === 'screen') { audio.playMidi(midi, 0, 0.5); input.suppressMic(700); }
      return;
    }
    judge(midi);
  });

  // Live "tuner" readout while the mic hears a sustained pitch.
  input.on('pitch', ({ midi, cents }) => {
    els.liveNote.textContent = theory.midiName(midi);
    els.liveLabel.textContent = `${cents > 0 ? '+' : ''}${cents}¢`;
    els.liveNote.classList.toggle('in-tune', Math.abs(cents) <= 8);
  });

  input.on('status', ({ status }) => {
    if (status.startsWith('mic')) updateMicUI(status);
    else updateMidiUI(status);
  });
  input.on('deviceschanged', (devices) => populateDevices(devices));

  /* ---------- MIDI UI ---------- */
  function updateMidiUI(status) {
    const map = {
      ready:       ['ok',   'MIDI ready'],
      unsupported: ['bad',  'Web MIDI unsupported here — use the keys below, or Chrome/Edge/Firefox'],
      denied:      ['bad',  'MIDI permission denied'],
      error:       ['bad',  'MIDI unavailable'],
      idle:        ['',     'Connecting to MIDI…'],
    };
    const [cls, text] = map[status] || ['', status];
    els.midiDot.className = 'dot ' + cls;
    els.midiText.textContent = text;
    els.midiSelect.style.display = status === 'ready' ? '' : 'none';
  }

  function updateMicUI(status) {
    const btn = els.micBtn;
    btn.classList.remove('mic-on');
    switch (status) {
      case 'mic-ready':
        btn.classList.add('mic-on');
        btn.textContent = 'Mic listening ●';
        break;
      case 'mic-off':
        btn.textContent = 'Use microphone';
        els.liveNote.classList.remove('in-tune');
        els.liveLabel.textContent = 'waiting for a note';
        break;
      case 'mic-denied':
        btn.textContent = 'Mic blocked — allow it';
        break;
      case 'mic-unsupported':
        btn.textContent = 'No mic available';
        btn.disabled = true;
        break;
      default:
        btn.textContent = 'Mic error — retry';
    }
  }

  function populateDevices(devices) {
    els.midiSelect.innerHTML = '';
    if (!devices.length) {
      els.midiText.textContent = 'No MIDI device — connect your piano (or use the keys below)';
      els.midiSelect.style.display = 'none';
      return;
    }
    const all = document.createElement('option');
    all.value = 'all';
    all.textContent = devices.length > 1 ? 'All MIDI inputs' : devices[0].name;
    els.midiSelect.appendChild(all);
    if (devices.length > 1) {
      devices.forEach((d) => {
        const o = document.createElement('option');
        o.value = d.id;
        o.textContent = d.name;
        els.midiSelect.appendChild(o);
      });
    }
    els.midiSelect.style.display = '';
    els.midiText.textContent = `MIDI ready · ${devices.length} device${devices.length > 1 ? 's' : ''}`;
  }
  els.midiSelect.addEventListener('change', (e) => input.selectDevice(e.target.value));

  /* ---------- buttons ---------- */
  els.actionBtn.addEventListener('click', () => { audio.ensure(); startQuestion(); });
  els.replayBtn.addEventListener('click', () => {
    const q = trainer.question;
    if (!q) return;
    audio.ensure();
    play(q, trainer.mode === 'ear' ? 'melodic' : 'root');
  });

  els.micBtn.addEventListener('click', async () => {
    if (input.micActive) { input.stopMic(); return; }
    els.micBtn.disabled = true;
    els.micBtn.textContent = 'Starting mic…';
    await input.initMic();
    els.micBtn.disabled = false;
  });

  // Spacebar = Start/Next, R = replay.
  document.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'SELECT') return;
    if (e.code === 'Space') { e.preventDefault(); if (!els.actionBtn.disabled) els.actionBtn.click(); }
    else if (e.key === 'r' || e.key === 'R') els.replayBtn.click();
  });

  /* ---------- boot ---------- */
  syncActionEnabled();
  showIdlePrompt();
  renderStats();
  updateMidiUI('idle');
  input.initMIDI();

  // Debug handle: inspect/drive the live instances from the console or tests.
  App._debug = { trainer, input, piano, selected };
})(window.App = window.App || {});
