import { Sounds, Song } from './audio.data.js';
import { PlaySynth } from './audio.synth.js';

/**
 * Play a song.
 * @param {!Song} song The song to play.
 * @param {!BaseAudioContext} ctx The audio context to play to.
 * @param {number} t0 The starting timestamp for playing the song.
 */
export function PlaySong(song, ctx, t0) {
  const ticksize = song.tickDuration;
  const gain = ctx.createGain();
  gain.gain.value = 0.2;
  gain.connect(ctx.destination);
  for (const track of song.tracks) {
    const { values, durations, instrument } = track;
    let t = t0;
    for (let i = 0; i < values.length; i++) {
      const value = values[i];
      const duration = durations[i];

      if (value > 0) {
        PlaySynth(Sounds[instrument], ctx, gain, t, duration * ticksize, value);
      }

      t += duration * ticksize;
    }
  }
}
