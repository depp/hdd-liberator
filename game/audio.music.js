import { Sounds, Song } from './audio.data.js';
import { PlaySynth } from './audio.synth.js';

/**
 * The audio tail for songs, in seconds.
 * @const {number}
 */
const SongTail = 2.0;

/**
 * @typedef {{
 *   buffer: !AudioBuffer,
 *   duration: number,
 * }}
 */
export var RenderedSong;

/**
 * Render a song to an audio buffer.
 * @param {!Song} song The song to render.
 * @param {number} sampleRate The sample rate.
 * @returns {Promise<RenderedSong>}
 */
export function RenderSong(song, sampleRate) {
  const { tickDuration, duration, tracks } = song;
  const ctx = new OfflineAudioContext(
    2,
    sampleRate * (tickDuration * duration + SongTail),
    sampleRate,
  );
  const gain = ctx.createGain();
  gain.gain.value = 0.2;
  gain.connect(ctx.destination);
  for (const track of tracks) {
    const { values, durations, instrument } = track;
    let t = 0;
    for (let i = 0; i < values.length; i++) {
      const noteValue = values[i];
      const noteDuration = durations[i];

      if (noteValue > 0) {
        PlaySynth(
          Sounds[instrument],
          ctx,
          gain,
          t,
          noteDuration * tickDuration,
          noteValue,
        );
      }

      t += noteDuration * tickDuration;
    }
  }
  return ctx
    .startRendering()
    .then((buffer) => ({ buffer, duration: tickDuration * duration }));
}
