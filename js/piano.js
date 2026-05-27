/* piano.js — an on-screen keyboard.
 *
 * Renders white/black keys across a MIDI range, reports presses via onPlay(midi),
 * and exposes a small highlight API the trainer uses for root / correct / wrong /
 * active states. It is both an input device and the visual feedback surface.
 */
(function (App) {
  'use strict';

  const { isBlack } = App.theory;
  const WHITE_W = 46;
  const BLACK_W = 28;
  const HEIGHT = 190;

  function createPiano(container, { low = 48, high = 84, onPlay = () => {} } = {}) {
    container.innerHTML = '';
    const piano = document.createElement('div');
    piano.className = 'piano';
    piano.style.height = HEIGHT + 'px';
    container.appendChild(piano);

    const keyByMidi = new Map();

    const whites = [];
    for (let m = low; m <= high; m++) if (!isBlack(m)) whites.push(m);

    // White keys, laid out left to right.
    whites.forEach((m, wIdx) => {
      const key = document.createElement('div');
      key.className = 'key white';
      key.dataset.midi = m;
      key.style.left = wIdx * WHITE_W + 'px';
      key.style.width = WHITE_W + 'px';
      key.style.height = HEIGHT + 'px';
      piano.appendChild(key);
      keyByMidi.set(m, key);
    });

    const pianoWidth = whites.length * WHITE_W;
    piano.style.width = pianoWidth + 'px';

    // Black keys, centered over the gap between their neighbouring white keys.
    for (let m = low; m <= high; m++) {
      if (!isBlack(m)) continue;
      const prev = whites.indexOf(m - 1);
      const next = whites.indexOf(m + 1);
      if (prev === -1 || next === -1) continue;
      const gapCenter = ((prev + 1) * WHITE_W + next * WHITE_W) / 2;
      const key = document.createElement('div');
      key.className = 'key black';
      key.dataset.midi = m;
      key.style.left = gapCenter - BLACK_W / 2 + 'px';
      key.style.width = BLACK_W + 'px';
      piano.appendChild(key);
      keyByMidi.set(m, key);
    }

    // Pointer input. Black keys sit above whites, so pointer events resolve the
    // topmost key naturally; stopPropagation keeps a black-key press off the white.
    function press(e) {
      const el = e.target.closest('.key');
      if (!el) return;
      e.preventDefault();
      onPlay(Number(el.dataset.midi), 'screen');
    }
    piano.addEventListener('pointerdown', press);

    // Fit to container width on small screens by scaling.
    function fit() {
      const avail = container.clientWidth;
      if (pianoWidth > avail && avail > 0) {
        const scale = avail / pianoWidth;
        piano.style.transform = `scale(${scale})`;
        piano.style.transformOrigin = 'top left';
        container.style.height = HEIGHT * scale + 'px';
      } else {
        piano.style.transform = 'none';
        container.style.height = HEIGHT + 'px';
      }
    }
    fit();
    window.addEventListener('resize', fit);

    const STATE_CLASSES = ['is-root', 'is-correct', 'is-wrong', 'is-active', 'is-target'];

    function highlight(midi, cls) {
      const el = keyByMidi.get(midi);
      if (el) el.classList.add(cls);
    }
    function unhighlight(midi, cls) {
      const el = keyByMidi.get(midi);
      if (el) el.classList.remove(cls);
    }
    function clear(cls) {
      const classes = cls ? [cls] : STATE_CLASSES;
      keyByMidi.forEach((el) => el.classList.remove(...classes));
    }
    // Briefly light a key (used to echo live played notes).
    function flash(midi, cls = 'is-active', ms = 260) {
      const el = keyByMidi.get(midi);
      if (!el) return;
      el.classList.add(cls);
      setTimeout(() => el.classList.remove(cls), ms);
    }
    function has(midi) {
      return keyByMidi.has(midi);
    }

    return { element: piano, highlight, unhighlight, clear, flash, fit, has, low, high };
  }

  App.createPiano = createPiano;
})(window.App = window.App || {});
