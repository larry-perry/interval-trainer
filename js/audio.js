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

  /* Play a list of MIDI notes one after another (a melody). Returns the total
   * playback time in seconds so callers can gate the mic for the right window. */
  function playSequence(midis, { noteDur = 0.45, gap = 0.12, startDelay = 0 } = {}) {
    ensure();
    let t = startDelay;
    midis.forEach((m) => {
      playMidi(m, t, noteDur);
      t += noteDur + gap;
    });
    return t;
  }

  /* Play several MIDI notes together (a chord) — used to sound a key reference. */
  function playChord(midis, dur = 0.8) {
    ensure();
    midis.forEach((m) => playMidi(m, 0, dur));
  }

  /* A quiet sustained drone — a soft, organ-ish pad that holds a tonal centre
   * *indefinitely* under the melody and the player's answer, until stopped.
   * Unlike `playChord` (a struck, decaying piano voice), it fades in and then
   * holds steady at a low level, sitting in the background as a reference rather
   * than competing with the line. The first note carries a gentle octave partial
   * for warmth; any extras (e.g. the fifth) are softer.
   *
   * Only one drone sounds at a time: starting a new one releases the old. */
  let droneVoice = null; // { master, oscs } of the currently-sounding drone

  function startDrone(midis, { gain = 0.06, attack = 0.3 } = {}) {
    ensure();
    stopDrone(0.08); // a new tonal centre replaces any drone already sounding
    const now = ctx.currentTime;

    const master = ctx.createGain();
    master.gain.setValueAtTime(0.0001, now);
    master.gain.exponentialRampToValueAtTime(gain, now + attack);
    master.connect(ctx.destination);

    const oscs = [];
    midis.forEach((m, idx) => {
      const freq = midiToFreq(m);
      const partials = idx === 0
        ? [{ ratio: 1, amp: 1.0 }, { ratio: 2, amp: 0.2 }]
        : [{ ratio: 1, amp: 0.55 }];
      partials.forEach((p) => {
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.value = freq * p.ratio;
        const g = ctx.createGain();
        g.gain.value = p.amp;
        osc.connect(g);
        g.connect(master);
        osc.start(now);
        oscs.push(osc);
      });
    });
    droneVoice = { master, oscs };
  }

  // Fade out and tear down the current drone (no-op if none is sounding).
  function stopDrone(release = 0.6) {
    if (!droneVoice || !ctx) return;
    const { master, oscs } = droneVoice;
    droneVoice = null;
    const now = ctx.currentTime;
    try {
      if (master.gain.cancelAndHoldAtTime) {
        master.gain.cancelAndHoldAtTime(now);
      } else {
        master.gain.cancelScheduledValues(now);
        master.gain.setValueAtTime(master.gain.value || 0.0001, now);
      }
      master.gain.exponentialRampToValueAtTime(0.0001, now + release);
    } catch (_) { /* ignore automation quirks across browsers */ }
    const stopAt = now + release + 0.05;
    oscs.forEach((o) => { try { o.stop(stopAt); } catch (_) { /* already stopped */ } });
  }

  App.audio = { ensure, getContext, resumeIfNeeded, playMidi, playInterval, playSequence, playChord, startDrone, stopDrone };
})(window.App = window.App || {});
