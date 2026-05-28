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
    resetBtn: $('#resetBtn'),
    sizeBtns: [...document.querySelectorAll('.size-btn')],
    statsToggle: $('#statsToggle'),
    heatmap: $('#heatmap'),
    heatmapLabel: $('#heatmapLabel'),
    hmModeBtns: [...document.querySelectorAll('.hm-mode-btn')],
    nudgeWeak: $('#nudgeWeak'),
    nudgeStrength: $('#nudgeStrength'),
    nudgeStrengthLabel: $('#nudgeStrengthLabel'),
    debugWeights: $('#debugWeights'),
    settingsBtn: $('#settingsBtn'),
    settingsModal: $('#settingsModal'),
    settingsClose: $('#settingsClose'),
  };

  // Slider positions → weighting strength fed to the trainer, and their labels.
  const STRENGTH_FACTORS = { 1: 0.5, 2: 1.5, 3: 3 };
  const STRENGTH_LABELS = { 1: 'Gentle', 2: 'Medium', 3: 'Strong' };

  const AUTO_ADVANCE_MS = 1100; // ~1s after a correct answer, per request
  let advanceTimer = null;
  let retrying = false;
  let lastJudged = null; // { playedMidi, result } — kept so we can re-paint on a keyboard rebuild
  let combos = {};
  let questionStartTime = 0;
  let heatmapMode = 'accuracy';
  const clearAdvance = () => { if (advanceTimer) { clearTimeout(advanceTimer); advanceTimer = null; } };

  // Play a prompt and deafen the mic for the playback window so the speakers
  // aren't mistaken for the player. The prompt sounds in its randomized octave.
  const SUPPRESS = { root: 1000, melodic: 1700, harmonic: 1400 };
  function play(q, style) {
    audio.playInterval(q.audioRootMidi, q.semi, style);
    input.suppressMic(SUPPRESS[style] || 1000);
  }

  const trainer = createTrainer();
  const input = createInputManager();
  const selected = new Set(); // nothing selected by default — the player chooses

  // The on-screen keyboard is rebuildable so it can switch between one octave
  // (phone-friendly) and the full range. Reassigning `piano` updates every
  // closure below that references it.
  const RANGES = { octave: { low: 60, high: 72 }, full: { low: 48, high: 84 } };
  let keyboardSize = 'octave';
  let piano;
  function buildPiano() {
    if (piano && piano.destroy) piano.destroy();
    piano = createPiano(els.pianoWrapper, {
      ...RANGES[keyboardSize],
      onPlay: (midi) => { audio.ensure(); input.feedScreenNote(midi); },
    });
  }
  buildPiano();

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
      saveState();
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
      saveState();
    });
  });

  /* ---------- helpers ---------- */
  function syncActionEnabled() {
    els.actionBtn.disabled = !trainer.hasSelection();
  }

  function applyStrength() {
    const level = Number(els.nudgeStrength.value);
    trainer.setWeakSpotStrength(STRENGTH_FACTORS[level] || STRENGTH_FACTORS[1]);
    els.nudgeStrengthLabel.textContent = STRENGTH_LABELS[level] || STRENGTH_LABELS[1];
    els.nudgeStrength.disabled = !els.nudgeWeak.checked;
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

  function recordCombo(rootPc, semi, correct, ms) {
    const key = rootPc + ':' + semi;
    if (!combos[key]) combos[key] = { a: 0, c: 0, t: 0, n: 0 };
    combos[key].a++;
    if (correct) {
      combos[key].c++;
      if (typeof ms === 'number') {
        combos[key].t += ms;
        combos[key].n++;
      }
    }
  }

  function recordTime(rootPc, semi, ms) {
    const key = rootPc + ':' + semi;
    if (!combos[key]) combos[key] = { a: 0, c: 0, t: 0, n: 0 };
    if (typeof ms === 'number') {
      combos[key].t += ms;
      combos[key].n++;
    }
  }

  function renderHeatmap() {
    const hm = els.heatmap;
    if (!hm) return;
    hm.innerHTML = '';

    const corner = document.createElement('div');
    corner.className = 'hm-corner';
    hm.appendChild(corner);

    for (let pc = 0; pc < 12; pc++) {
      const cell = document.createElement('div');
      cell.className = 'hm-col-head';
      cell.textContent = theory.pcName(pc);
      hm.appendChild(cell);
    }

    const isTime = heatmapMode === 'time';
    if (els.heatmapLabel) {
      els.heatmapLabel.textContent = isTime ? 'Speed — note × interval' : 'Accuracy — note × interval';
    }

    theory.INTERVALS.forEach((iv) => {
      const rowHead = document.createElement('div');
      rowHead.className = 'hm-row-head';
      rowHead.textContent = iv.name;
      hm.appendChild(rowHead);

      for (let pc = 0; pc < 12; pc++) {
        const cell = document.createElement('div');
        cell.className = 'hm-cell';
        const key = pc + ':' + iv.semi;
        const entry = combos[key];
        const a = entry ? entry.a : 0;
        const c = entry ? entry.c : 0;
        const targetPc = theory.pitchClass(pc + iv.semi);
        const targetName = theory.pcName(targetPc);

        if (entry && entry.a > 0) {
          if (isTime) {
            if (entry.n > 0) {
              const avg = entry.t / entry.n;
              const hue = Math.max(0, 125 - Math.round((avg / 3000) * 125));
              cell.style.background = 'hsl(' + hue + ', 60%, 47%)';
            }
            cell.style.opacity = 0.35 + 0.65 * Math.min(entry.a, 5) / 5;
          } else {
            const acc = entry.c / entry.a;
            cell.style.background = 'hsl(' + Math.round(acc * 125) + ', 60%, 47%)';
            cell.style.opacity = 0.35 + 0.65 * Math.min(entry.a, 5) / 5;
          }
        }

        if (isTime) {
          const n = entry ? entry.n : 0;
          const avg = n > 0 ? Math.round(entry.t / n) : 0;
          const label = n > 0 ? avg + 'ms' : '—';
          cell.title = theory.pcName(pc) + ' + ' + iv.name + ' = ' + targetName + ' — ' + label + ' (' + c + '/' + a + ')';
        } else {
          const acc = a ? c / a : 0;
          cell.title = theory.pcName(pc) + ' + ' + iv.name + ' = ' + targetName + ' — ' + c + '/' + a + ' (' + Math.round(acc * 100) + '%)';
        }

        hm.appendChild(cell);
      }
    });
  }

  const STORAGE_KEY = 'intervalTrainer.v1';

  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        selectedSemis: [...selected],
        mode: trainer.mode,
        keyboardSize,
        autoAdvance: els.autoAdvance.checked,
        nudgeWeak: els.nudgeWeak.checked,
        nudgeStrength: Number(els.nudgeStrength.value),
        debug: els.debugWeights.checked,
        stats: { ...trainer.stats },
        combos,
        heatmapMode,
      }));
    } catch (e) { /* silently ignore */ }
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const data = JSON.parse(raw);

      if (Array.isArray(data.selectedSemis)) {
        data.selectedSemis.forEach((s) => selected.add(s));
        trainer.setSelected(selected);
        els.intervalSelector.querySelectorAll('.interval-btn').forEach((btn) => {
          btn.classList.toggle('active', selected.has(Number(btn.dataset.semi)));
        });
        syncActionEnabled();
      }

      if (typeof data.nudgeWeak === 'boolean') {
        els.nudgeWeak.checked = data.nudgeWeak;
        trainer.setWeakSpotWeighting(data.nudgeWeak);
      }

      if (data.nudgeStrength >= 1 && data.nudgeStrength <= 3) {
        els.nudgeStrength.value = data.nudgeStrength;
      }

      if (typeof data.debug === 'boolean') {
        els.debugWeights.checked = data.debug;
        trainer.setDebug(data.debug);
      }

      if (data.mode === 'play' || data.mode === 'ear') {
        trainer.setMode(data.mode);
        els.modeBtns.forEach((b) => b.classList.toggle('active', b.dataset.mode === data.mode));
      }

      if (data.keyboardSize === 'octave' || data.keyboardSize === 'full') {
        keyboardSize = data.keyboardSize;
        buildPiano();
        els.sizeBtns.forEach((b) => b.classList.toggle('active', b.dataset.size === keyboardSize));
      }

      if (typeof data.autoAdvance === 'boolean') {
        els.autoAdvance.checked = data.autoAdvance;
      }

      if (data.stats && typeof data.stats === 'object') {
        trainer.setStats(data.stats);
      }

      if (data.combos && typeof data.combos === 'object') {
        combos = data.combos;
        renderHeatmap();
      }

      if (data.heatmapMode === 'accuracy' || data.heatmapMode === 'time') {
        heatmapMode = data.heatmapMode;
        els.hmModeBtns.forEach((b) => b.classList.toggle('active', b.dataset.mode === heatmapMode));
      }
    } catch (e) { /* fall back to defaults */ }
  }

  function showIdlePrompt() {
    els.prompt.className = 'prompt';
    const verb = trainer.mode === 'ear' ? 'Listen, then play what you hear' : 'Play the named interval';
    els.prompt.innerHTML = `
      <div class="prompt-kicker">${trainer.mode === 'ear' ? 'Ear training' : 'Interval reading'}</div>
      <div class="prompt-idle">${verb}.<br>Pick intervals below and press <strong>Start</strong>.</div>`;
  }

  // Repaint key highlights for the current question/phase (used after a rebuild too).
  function refreshHighlights() {
    piano.clear();
    const q = trainer.question;
    if (!q) return;
    piano.highlightPc(q.rootPc, 'is-root');
    if (trainer.phase === 'answered') {
      piano.highlightPc(q.targetPc, 'is-target');
      if (lastJudged && piano.has(lastJudged.playedMidi)) {
        piano.highlight(lastJudged.playedMidi, lastJudged.result === 'correct' ? 'is-correct' : 'is-wrong');
      }
    }
  }

  /* ---------- question flow ---------- */
  function startQuestion() {
    clearAdvance();
    retrying = false;
    lastJudged = null;
    const q = trainer.next();
    if (!q) return;
    questionStartTime = Date.now();
    audio.ensure();
    piano.clear();
    piano.highlightPc(q.rootPc, 'is-root');

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
    lastJudged = { playedMidi, result: res.result };
    const ms = res.result === 'correct' ? Date.now() - questionStartTime : undefined;
    recordCombo(q.rootPc, q.semi, res.result === 'correct', ms);
    renderHeatmap();

    piano.clear('is-active');
    piano.highlightPc(q.targetPc, 'is-target'); // the answer note, in every octave shown

    const answerText = q.answer.accurate
      ? `${q.answer.display} <span class="muted">(more precisely ${q.answer.accurate})</span>`
      : q.answer.display;
    const nameReveal = trainer.mode === 'ear'
      ? ` — that was a <strong>${q.interval.label}</strong>`
      : '';

    if (res.result === 'wrong') {
      retrying = true;
      els.prompt.className = 'prompt wrong';
      if (piano.has(playedMidi)) piano.highlight(playedMidi, 'is-wrong');
      els.prompt.innerHTML = `
        <div class="prompt-kicker">Not quite</div>
        <div class="prompt-result">The answer was <strong>${answerText}</strong>${nameReveal}.</div>
        <div class="prompt-task muted">You played ${theory.midiName(playedMidi)}.</div>
        <div class="prompt-task muted">Find it on your piano.</div>`;
    } else {
      retrying = false;
      els.prompt.className = 'prompt correct';
      if (piano.has(playedMidi)) piano.highlight(playedMidi, 'is-correct');
      els.prompt.innerHTML = `
        <div class="prompt-kicker">Correct</div>
        <div class="prompt-result"><strong>${answerText}</strong>${nameReveal}</div>`;
      play(q, 'harmonic');
      if (els.autoAdvance.checked) advanceTimer = setTimeout(startQuestion, AUTO_ADVANCE_MS);
    }
    renderStats();
    saveState();
  }

  /* ---------- input events ---------- */
  input.on('noteon', ({ midi, source }) => {
    audio.ensure();
    setLive(midi);
    if (piano.has(midi)) piano.flash(midi, 'is-active');
    else piano.flashPc(theory.pitchClass(midi), 'is-active');
    // After a miss: hunt for the right note. Found note confirms + advances (not scored).
    if (trainer.phase === 'answered' && retrying) {
      const q = trainer.question;
      if (theory.pitchClass(midi) === q.targetPc) {
        retrying = false;
        clearAdvance();
        piano.clear('is-active');
        piano.highlightPc(q.targetPc, 'is-target');
        if (piano.has(midi)) piano.highlight(midi, 'is-correct');
        const answerText = q.answer.accurate
          ? `${q.answer.display} <span class="muted">(more precisely ${q.answer.accurate})</span>`
          : q.answer.display;
        els.prompt.className = 'prompt correct';
        els.prompt.innerHTML = `
          <div class="prompt-kicker">There it is</div>
          <div class="prompt-result"><strong>${answerText}</strong></div>`;
        const ms = Date.now() - questionStartTime;
        recordTime(q.rootPc, q.semi, ms);
        renderHeatmap();
        play(q, 'harmonic');
        if (els.autoAdvance.checked) advanceTimer = setTimeout(startQuestion, 900);
      } else if (source === 'screen') {
        // sound the player's hunting taps (MIDI/mic already make real sound)
        audio.playMidi(midi, 0, 0.5);
        input.suppressMic(700);
      }
      return;
    }
    if (trainer.phase !== 'awaiting') return;

    // Playing the root is "free" — any octave of it lets you orient without being
    // judged. (No interval here lands on the root's own pitch class, so this is safe.)
    const q = trainer.question;
    if (theory.pitchClass(midi) === q.rootPc) {
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

  els.resetBtn.addEventListener('click', () => { trainer.resetStats(); renderStats(); combos = {}; trainer.setCombos(combos); renderHeatmap(); saveState(); });

  els.statsToggle.addEventListener('click', () => {
    const hidden = els.heatmap.style.display === 'none';
    els.heatmap.style.display = hidden ? '' : 'none';
    els.statsToggle.textContent = hidden ? 'Hide' : 'Show';
  });

  els.hmModeBtns.forEach((b) => {
    b.addEventListener('click', () => {
      if (b.dataset.mode === heatmapMode) return;
      heatmapMode = b.dataset.mode;
      els.hmModeBtns.forEach((x) => x.classList.toggle('active', x.dataset.mode === heatmapMode));
      renderHeatmap();
      saveState();
    });
  });

  // Keyboard size: one octave (phone-friendly) vs the full range.
  els.sizeBtns.forEach((b) => {
    b.addEventListener('click', () => {
      if (b.dataset.size === keyboardSize) return;
      keyboardSize = b.dataset.size;
      els.sizeBtns.forEach((x) => x.classList.toggle('active', x === b));
      buildPiano();
      refreshHighlights();
      saveState();
    });
  });

  // Settings modal: open/close. Escape-to-close is handled natively by <dialog>;
  // a click on the backdrop (target is the dialog itself) closes it too.
  els.settingsBtn.addEventListener('click', () => els.settingsModal.showModal());
  els.settingsClose.addEventListener('click', () => els.settingsModal.close());
  els.settingsModal.addEventListener('click', (e) => {
    if (e.target === els.settingsModal) els.settingsModal.close();
  });

  els.autoAdvance.addEventListener('change', saveState);

  els.nudgeWeak.addEventListener('change', () => {
    trainer.setWeakSpotWeighting(els.nudgeWeak.checked);
    applyStrength();
    saveState();
  });

  els.nudgeStrength.addEventListener('input', () => { applyStrength(); saveState(); });

  els.debugWeights.addEventListener('change', () => {
    trainer.setDebug(els.debugWeights.checked);
    saveState();
  });

  // Spacebar = Start/Next, R = replay.
  document.addEventListener('keydown', (e) => {
    if (els.settingsModal.open) return;
    if (e.target.tagName === 'SELECT') return;
    if (e.code === 'Space') { e.preventDefault(); if (!els.actionBtn.disabled) els.actionBtn.click(); }
    else if (e.key === 'r' || e.key === 'R') els.replayBtn.click();
  });

  /* ---------- boot ---------- */
  loadState();
  // loadState may replace the `combos` object wholesale (combos = data.combos),
  // so point the engine at the live reference here — after the load — or weak-spot
  // weighting silently reads a stale, empty map and falls back to uniform picks.
  trainer.setCombos(combos);
  // Sync the engine to the checkbox: a fresh visitor gets the default (on), while
  // loadState has already restored an explicit choice from a prior session.
  trainer.setWeakSpotWeighting(els.nudgeWeak.checked);
  trainer.setDebug(els.debugWeights.checked);
  applyStrength();
  syncActionEnabled();
  showIdlePrompt();
  renderStats();
  renderHeatmap();
  updateMidiUI('idle');
  input.initMIDI();

  // Debug handle: inspect/drive the live instances from the console or tests.
  App._debug = { trainer, input, selected, get piano() { return piano; } };
})(window.App = window.App || {});
