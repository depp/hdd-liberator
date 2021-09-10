import { Sounds, Song } from './audio.data.js';
import { PlaySynth } from './audio.synth.js';
import { COMPO } from './common.js';

/**
 * The audio tail for songs, in seconds.
 * @const {number}
 */
const SongTail = 2.0;

/**
 * @typedef {{
 *   Buffer: !AudioBuffer,
 *   Duration: number,
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
  const { TickDuration, Duration, Tracks } = song;
  const constructor =
    window.OfflineAudioContext ?? window.webkitOfflineAudioContext;
  if (!COMPO && !constructor) {
    throw new Error('no offline audio constructor');
  }
  const ctx = new constructor(
    2,
    sampleRate * (TickDuration * Duration + SongTail),
    sampleRate,
  );
  const gain = ctx.createGain();
  gain.gain.value = 0.2;
  gain.connect(ctx.destination);
  for (const track of Tracks) {
    const { Values, Durations, Instrument } = track;
    let t = 0;
    for (let i = 0; i < Values.length; i++) {
      const noteValue = Values[i];
      const noteDuration = Durations[i];

      if (noteValue > 0) {
        PlaySynth(
          Sounds[Instrument],
          ctx,
          gain,
          t,
          noteDuration * TickDuration,
          noteValue,
        );
      }

      t += noteDuration * TickDuration;
    }
  }
  return ctx
    .startRendering()
    .then((Buffer) => ({ Buffer, Duration: TickDuration * Duration }));
}
