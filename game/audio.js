import { COMPO } from './common.js';
import { Iterate } from './util.js';

/**
 * @typedef {{
 *   values: Array<number>!,
 *   durations: Array<number>!,
 * }}
 */
var Track;

/**
 * @typedef {{
 *   tickDuration: number,
 *   tracks: Array<Track>!,
 * }}
 */
var Song;

/**
 * @type {Array<Song>}
 */
let Songs;

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

  if (!Songs) {
    return;
  }
  const song = Songs[0];
  if (!song) {
    return;
  }
  const ticksize = song.tickDuration;
  const t0 = Ctx.currentTime;
  for (const track of song.tracks) {
    const { values, durations } = track;
    let t = t0;
    for (let i = 0; i < values.length; i++) {
      const value = values[i];
      const duration = durations[i];

      if (value != 0x80) {
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
        osc.detune.value = 5 * (Math.random() - 0.5);
        osc.connect(filter);
        osc.type = 'sawtooth';
        osc.frequency.value = 440 * 2 ** ((value - 69) / 12);
        osc.start(t);
        osc.stop(t + 1);
      }

      t += duration * ticksize;
    }
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

/**
 * Load music tracks from the given raw binary data.
 * @param {Array<number>} data
 */
export function LoadMusic(data) {
  const initialValue = 64;
  let pos = 1;
  /** @type {Array<Song>!} */
  let songs = [];
  /** @type {Array<Track!>!} */
  let allTracks = [];
  let nsongs = data[0];
  while (nsongs--) {
    if (!COMPO && pos + 4 > data.length) {
      throw new Error('music parsing failed');
    }
    /** @type {Array<Track!>!} */
    const tracks = Iterate(data[pos], () => /** @type {Track} */ ({}));
    allTracks.push(...tracks);
    songs.push({
      tickDuration: data[pos + 1] / 1000,
      tracks,
    });
    pos += 4;
  }
  for (const track of allTracks) {
    let value = initialValue;
    /** @type {Array<number>!} */
    let values = [];
    track.values = values;
    loop: while (1) {
      if (!COMPO && pos >= data.length) {
        throw new Error('music parsing failed');
      }
      const byte = data[pos++];
      if (byte >> 7) {
        switch (byte) {
          case 0x80:
            // rest
            values.push(128);
            break;
          case 0x81:
            // track end
            break loop;
        }
      } else {
        value = (value + byte) & 127;
        values.push(value);
      }
    }
  }
  for (const track of allTracks) {
    track.durations = data.slice(pos, (pos += track.values.length));
  }
  Songs = songs;
}
