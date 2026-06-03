/* input.js — one event stream for every input source.
 *
 * Sources: USB MIDI (Web MIDI API), the on-screen keyboard, and — later —
 * microphone pitch detection. Everything normalises to:
 *     'noteon'  -> { midi, velocity (0..1), source }
 *     'noteoff' -> { midi, source }
 * The trainer never has to know where a note came from.
 */
(function (App) {
  'use strict';

  function createInputManager() {
    const listeners = { noteon: [], noteoff: [], deviceschanged: [], status: [], pitch: [] };
    const on = (evt, cb) => { (listeners[evt] || (listeners[evt] = [])).push(cb); };
    const emit = (evt, payload) => { (listeners[evt] || []).forEach((cb) => cb(payload)); };

    let midiAccess = null;
    let selectedId = 'all';        // 'all' or a specific MIDI input id
    const boundInputs = new Set(); // inputs we've attached onmidimessage to
    let status = 'idle';           // idle | unsupported | denied | ready | error

    function setStatus(s, detail) {
      status = s;
      emit('status', { status: s, detail });
    }

    /* ---- USB MIDI ---- */

    function midiSupported() {
      return typeof navigator !== 'undefined' && !!navigator.requestMIDIAccess;
    }

    function handleMessage(e, source) {
      const [data0, note, velocity] = e.data;
      const type = data0 & 0xf0;
      if (type === 0x90 && velocity > 0) {
        emit('noteon', { midi: note, velocity: velocity / 127, source });
      } else if (type === 0x80 || (type === 0x90 && velocity === 0)) {
        emit('noteoff', { midi: note, source });
      }
    }

    function rebind() {
      if (!midiAccess) return;
      boundInputs.forEach((inp) => { inp.onmidimessage = null; });
      boundInputs.clear();
      midiAccess.inputs.forEach((inp) => {
        if (selectedId === 'all' || inp.id === selectedId) {
          inp.onmidimessage = (e) => handleMessage(e, `midi:${inp.name}`);
          boundInputs.add(inp);
        }
      });
    }

    function listDevices() {
      if (!midiAccess) return [];
      return [...midiAccess.inputs.values()].map((i) => ({ id: i.id, name: i.name || 'MIDI input' }));
    }

    async function initMIDI() {
      if (!midiSupported()) { setStatus('unsupported'); return { supported: false }; }
      try {
        midiAccess = await navigator.requestMIDIAccess({ sysex: false });
        midiAccess.onstatechange = () => { rebind(); emit('deviceschanged', listDevices()); };
        rebind();
        setStatus('ready');
        emit('deviceschanged', listDevices());
        return { supported: true, devices: listDevices() };
      } catch (err) {
        setStatus(err && err.name === 'SecurityError' ? 'denied' : 'error', String(err));
        return { supported: true, error: err };
      }
    }

    function selectDevice(id) {
      selectedId = id || 'all';
      rebind();
    }

    /* ---- On-screen keyboard ---- */
    // A click is momentary: fire noteon now, noteoff shortly after.
    function feedScreenNote(midi, velocity = 0.7) {
      emit('noteon', { midi, velocity, source: 'screen' });
      setTimeout(() => emit('noteoff', { midi, source: 'screen' }), 220);
    }

    /* ---- Microphone pitch detection ---- */
    let micStream = null;
    let analyser = null;
    let micBuf = null;
    let micRAF = 0;
    let micActive = false;
    let suppressUntil = 0; // ignore mic until this timestamp (during our own playback)

    // Onset/offset state for turning a continuous pitch stream into notes.
    let lastMidi = null;   // currently-sounding note we reported
    let candMidi = null;   // candidate awaiting stability
    let candCount = 0;
    let silentFrames = 0;
    const STABLE_FRAMES = 3; // frames a pitch must hold before we call a note-on
    const SILENCE_FRAMES = 5; // frames of silence before we call note-off

    // Tell the mic to ignore input for `ms` (e.g. while the app plays a prompt,
    // so the speakers don't get heard as the player).
    function suppressMic(ms) {
      suppressUntil = performance.now() + ms;
    }

    function micLoop() {
      if (!micActive) return;
      micRAF = requestAnimationFrame(micLoop);
      if (performance.now() < suppressUntil) return;

      analyser.getFloatTimeDomainData(micBuf);
      const res = App.detectPitch(micBuf, analyser.context.sampleRate);

      if (!res) {
        if (++silentFrames >= SILENCE_FRAMES && lastMidi !== null) {
          emit('noteoff', { midi: lastMidi, source: 'mic' });
          lastMidi = candMidi = null;
          candCount = 0;
        }
        return;
      }
      silentFrames = 0;

      const fmidi = App.theory.freqToMidi(res.freq);
      const midi = Math.round(fmidi);
      const cents = Math.round((fmidi - midi) * 100);
      emit('pitch', { freq: res.freq, midi, cents, clarity: res.clarity, source: 'mic' });

      if (midi === candMidi) candCount++;
      else { candMidi = midi; candCount = 1; }

      if (candCount >= STABLE_FRAMES && midi !== lastMidi) {
        if (lastMidi !== null) emit('noteoff', { midi: lastMidi, source: 'mic' });
        emit('noteon', { midi, velocity: Math.min(1, res.clarity), source: 'mic', cents });
        lastMidi = midi;
      }
    }

    async function initMic() {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setStatus('mic-unsupported');
        return { supported: false };
      }
      try {
        micStream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
        });
        const ctx = App.audio.getContext();
        await App.audio.resumeIfNeeded();
        const src = ctx.createMediaStreamSource(micStream);
        analyser = ctx.createAnalyser();
        analyser.fftSize = 2048;
        micBuf = new Float32Array(analyser.fftSize);
        src.connect(analyser); // deliberately NOT connected to destination (no feedback)
        micActive = true;
        lastMidi = candMidi = null;
        candCount = silentFrames = 0;
        setStatus('mic-ready');
        micLoop();
        return { supported: true };
      } catch (err) {
        setStatus(err && err.name === 'NotAllowedError' ? 'mic-denied' : 'mic-error', String(err));
        return { supported: false, error: err };
      }
    }

    function stopMic() {
      micActive = false;
      if (micRAF) cancelAnimationFrame(micRAF);
      if (micStream) micStream.getTracks().forEach((t) => t.stop());
      micStream = null;
      analyser = null;
      if (lastMidi !== null) emit('noteoff', { midi: lastMidi, source: 'mic' });
      lastMidi = candMidi = null;
      setStatus('mic-off');
    }

    return {
      on,
      midiSupported,
      initMIDI,
      initMic,
      stopMic,
      suppressMic,
      listDevices,
      selectDevice,
      feedScreenNote,
      get status() { return status; },
      get micActive() { return micActive; },
      get selectedDeviceId() { return selectedId; },
    };
  }

  App.createInputManager = createInputManager;
})(window.App = window.App || {});
