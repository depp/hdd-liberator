import { COMPO } from './common.js';
import { Songs } from './audio.data.js';
import { PlaySong } from './audio.music.js';

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

/**
 * Play an in-game sound.
 */
function PlaySound() {
  if (Songs == null || Ctx == null) {
    return;
  }
  const song = Songs[0];
  if (song == null) {
    return;
  }
  PlaySong(song, Ctx, Ctx.currentTime);
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
