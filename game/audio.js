import { COMPO } from './common.js';

/**
 * @type {AudioContext?}
 */
let Ctx;

/**
 * Play a sound with the given buffer.
 * @param {AudioBuffer} buffer
 */
function PlayBuffer(buffer) {
  if (!COMPO && !Ctx) {
    throw new Error('Ctx is null');
  }
  const source = Ctx.createBufferSource();
  source.buffer = buffer;
  source.connect(Ctx.destination);
  source.start();
}

export function PlaySound() {
  if (!COMPO && !Ctx) {
    throw new Error('Ctx is null');
  }

  const values = [36, 48, 36, 48, 36, 43, 39, 48];
  let t = Ctx.currentTime;
  for (const value of values) {
    const gain = Ctx.createGain();
    gain.connect(Ctx.destination);
    gain.gain.setValueAtTime(1e-6, t);
    gain.gain.exponentialRampToValueAtTime(1, t + 0.02);
    gain.gain.exponentialRampToValueAtTime(1e-2, t + 1);

    const filter = Ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.connect(gain);
    filter.frequency.setValueAtTime(100, t);
    filter.frequency.exponentialRampToValueAtTime(15e3, t + 0.1);
    filter.frequency.exponentialRampToValueAtTime(100, t + 1);
    filter.Q.value = 1.4;

    const osc = Ctx.createOscillator();
    osc.connect(filter);
    osc.type = 'sawtooth';
    osc.frequency.value = 440 * 2 ** ((value - 69) / 12);
    osc.start(t);
    osc.stop(t + 1);

    t += 0.5;
  }
}

/**
 * Start the audio system. This must be called while handling a UI event.
 */
export function Start() {
  const constructor = window.AudioContext ?? window.webkitAudioContext;
  if (!constructor) {
    if (!COMPO) {
      console.error('No audio context constructor');
    }
    return;
  }
  Ctx = new constructor();
  const silence = Ctx.createBuffer(1, 1000, Ctx.sampleRate);
  PlayBuffer(silence);
  PlaySound();
}
