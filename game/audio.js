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
  const gain = Ctx.createGain();
  gain.connect(Ctx.destination);
  gain.gain.value = 1e-6;
  gain.gain.exponentialRampToValueAtTime(1, 0.02);
  gain.gain.exponentialRampToValueAtTime(1e-2, 1);

  const filter = Ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.connect(gain);
  filter.frequency.value = 100;
  filter.frequency.exponentialRampToValueAtTime(15e3, 0.1);
  filter.frequency.exponentialRampToValueAtTime(100, 1);
  filter.Q.value = 1.4;

  const osc = Ctx.createOscillator();
  osc.connect(filter);
  osc.type = 'sawtooth';
  osc.frequency.value = 440 * 2 ** (-9 / 12);
  osc.start();
  osc.stop(Ctx.currentTime + 1);
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
