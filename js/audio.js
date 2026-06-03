/* audio.js — a small Web Audio piano-ish synth for playing prompts.
 *
 * The single-note voice (additive partials + filtered hammer-noise transient)
 * is adapted from the original TuTempo trainer; here it's wrapped in an engine
 * that also plays intervals melodically or harmonically.
 */
(function (App) {
  'use strict';

  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  const { midiToFreq } = App.theory;

  let ctx = null;

  // Resume the context whenever it isn't actively running. Backgrounding a tab
  // leaves the context 'suspended' (most browsers) or 'interrupted' (iOS Safari,
  // non-standard); both silence playback until resumed. Checking only for
  // 'suspended' missed the iOS case, which is why sound stayed dead on resume.
  function resumeIfNeeded() {
    if (ctx && ctx.state !== 'running' && ctx.state !== 'closed') {
      return ctx.resume().catch(() => {});
    }
    return Promise.resolve();
  }

  function ensure() {
    if (!ctx) ctx = new AudioCtx();
    resumeIfNeeded();
    return ctx;
  }

  // The mic analyser shares this context (created on demand if playback hasn't run yet).
  function getContext() {
    if (!ctx) ctx = new AudioCtx();
    return ctx;
  }

  // Proactively wake the context when the user returns to the tab, rather than
  // waiting for the next playback call. Some browsers only honour resume() inside
  // a user gesture, so we also listen for the first interaction as a fallback.
  function wake() {
    resumeIfNeeded();
  }
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') wake();
  });
  window.addEventListener('focus', wake);
  window.addEventListener('pointerdown', wake, { passive: true });
  window.addEventListener('keydown', wake);
  window.addEventListener('touchstart', wake, { passive: true });

  // Play one MIDI note at `delay` seconds from now, lasting `duration` seconds.
  function playMidi(midi, delay = 0, duration = 0.5) {
    ensure();
    const freq = midiToFreq(midi);
    const now = ctx.currentTime + delay;
    const vel = 0.3;

    const master = ctx.createGain();
    master.gain.setValueAtTime(vel, now);
    master.gain.setTargetAtTime(vel * 0.7, now + 0.005, 0.08);
    master.gain.setTargetAtTime(vel * 0.35, now + 0.15, 0.4);
    master.gain.setTargetAtTime(0.001, now + duration + 0.1, 0.25);
    master.connect(ctx.destination);

    const lpf = ctx.createBiquadFilter();
    lpf.type = 'lowpass';
    lpf.frequency.setValueAtTime(Math.min(freq * 8, 12000), now);
    lpf.frequency.setTargetAtTime(Math.min(freq * 3, 5000), now + 0.02, 0.3);
    lpf.Q.value = 0.7;
    lpf.connect(master);

    // Slight inharmonicity: upper partials run a touch sharp, like a real string.
    const inharm = 1 + 0.0002 * (midi - 60) * (midi - 60) * 0.01;
    const partials = [
      { ratio: 1, amp: 1.0,  decay: 0.6 },
      { ratio: 2, amp: 0.45, decay: 0.45 },
      { ratio: 3, amp: 0.18, decay: 0.3 },
      { ratio: 4, amp: 0.08, decay: 0.22 },
      { ratio: 5, amp: 0.04, decay: 0.15 },
      { ratio: 6, amp: 0.02, decay: 0.12 },
    ];
    const stopTime = now + duration + 1.2;

    partials.forEach((p) => {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq * p.ratio * Math.pow(inharm, p.ratio - 1), now);
      const g = ctx.createGain();
      g.gain.setValueAtTime(p.amp, now);
      g.gain.setTargetAtTime(p.amp * 0.5, now + 0.003, p.decay * 0.3);
      g.gain.setTargetAtTime(p.amp * 0.15, now + 0.1, p.decay);
      g.gain.setTargetAtTime(0.0001, now + duration, 0.2);
      osc.connect(g);
      g.connect(lpf);
      osc.start(now);
      osc.stop(stopTime);
    });

    // Hammer-strike transient: a short filtered noise burst.
    const bufLen = ctx.sampleRate * 0.025;
    const noiseBuf = ctx.createBuffer(1, bufLen, ctx.sampleRate);
    const data = noiseBuf.getChannelData(0);
    for (let i = 0; i < bufLen; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufLen * 0.15));
    }
    const noiseSrc = ctx.createBufferSource();
    noiseSrc.buffer = noiseBuf;
    const bpf = ctx.createBiquadFilter();
    bpf.type = 'bandpass';
    bpf.frequency.value = Math.min(freq * 4, 8000);
    bpf.Q.value = 1.5;
    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(0.12, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);
    noiseSrc.connect(bpf);
    bpf.connect(noiseGain);
    noiseGain.connect(master);
    noiseSrc.start(now);
    noiseSrc.stop(now + 0.05);
  }

  /* Play an interval from rootMidi.
   *   style 'melodic'  -> root, then target (default)
   *   style 'harmonic' -> both together
   *   style 'root'     -> root only */
  function playInterval(rootMidi, semi, style = 'melodic') {
    ensure();
    if (style === 'root') {
      playMidi(rootMidi, 0, 0.6);
      return;
    }
    if (style === 'harmonic') {
      playMidi(rootMidi, 0, 0.9);
      playMidi(rootMidi + semi, 0, 0.9);
      return;
    }
    playMidi(rootMidi, 0, 0.5);
    playMidi(rootMidi + semi, 0.5, 0.6);
  }

  App.audio = { ensure, getContext, resumeIfNeeded, playMidi, playInterval };
})(window.App = window.App || {});
