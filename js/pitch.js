/* pitch.js — monophonic pitch detection via normalized autocorrelation.
 *
 * Given a time-domain buffer (Float32, samples in [-1, 1]) it returns the
 * fundamental frequency and a clarity score in [0, 1], or null when the signal
 * is too quiet or too noisy to call. This is the classic autocorrelation method
 * (à la Chris Wilson's PitchDetect): trim the quiet attack/release, correlate
 * the signal against lagged copies of itself, and take the strongest periodic
 * peak — refined with parabolic interpolation. Good enough for one piano note
 * at a time; polyphony is out of scope.
 */
(function (App) {
  'use strict';

  const FMIN = 50;       // lowest fundamental we look for (Hz)
  const FMAX = 2200;     // highest fundamental we look for (Hz)
  const RMS_GATE = 0.008; // below this we treat the frame as silence
  const TRIM = 0.12;     // amplitude below which leading/trailing samples are trimmed
  const CLARITY_GATE = 0.5;

  function detectPitch(buf, sampleRate) {
    let SIZE = buf.length;

    let rms = 0;
    for (let i = 0; i < SIZE; i++) rms += buf[i] * buf[i];
    rms = Math.sqrt(rms / SIZE);
    if (rms < RMS_GATE) return null;

    // Trim quiet ends so a decaying note doesn't smear the correlation.
    let r1 = 0, r2 = SIZE - 1;
    const half = SIZE >> 1;
    for (let i = 0; i < half; i++) { if (Math.abs(buf[i]) > TRIM) { r1 = i; break; } }
    for (let i = 0; i < half; i++) { if (Math.abs(buf[SIZE - 1 - i]) > TRIM) { r2 = SIZE - 1 - i; break; } }
    const b = buf.subarray(r1, r2 + 1);
    SIZE = b.length;
    if (SIZE < 256) return null;

    const maxLag = Math.min(SIZE - 1, Math.ceil(sampleRate / FMIN));
    const minLag = Math.max(2, Math.floor(sampleRate / FMAX));

    const c = new Float32Array(maxLag + 2);
    for (let lag = 0; lag <= maxLag; lag++) {
      let s = 0;
      for (let i = 0; i < SIZE - lag; i++) s += b[i] * b[i + lag];
      c[lag] = s;
    }

    // Walk past the central lobe to the first trough, then take the global max.
    let d = 1;
    while (d < maxLag && c[d] > c[d + 1]) d++;
    let maxval = -1, maxpos = -1;
    for (let i = Math.max(d, minLag); i <= maxLag; i++) {
      if (c[i] > maxval) { maxval = c[i]; maxpos = i; }
    }
    if (maxpos <= 0) return null;

    const clarity = c[0] > 0 ? maxval / c[0] : 0;
    if (clarity < CLARITY_GATE) return null;

    // Parabolic interpolation around the peak for sub-sample period accuracy.
    let T0 = maxpos;
    if (maxpos > 0 && maxpos < maxLag) {
      const x1 = c[maxpos - 1], x2 = c[maxpos], x3 = c[maxpos + 1];
      const a = (x1 + x3 - 2 * x2) / 2;
      const beta = (x3 - x1) / 2;
      if (a) T0 = maxpos - beta / (2 * a);
    }

    return { freq: sampleRate / T0, clarity };
  }

  App.detectPitch = detectPitch;
})(window.App = window.App || {});
