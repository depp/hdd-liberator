import { COMPO } from './common.js';
import { Sounds, Song } from './audio.data.js';
import { PlaySynth } from './audio.synth.js';

/**
 * Render a song to an audio buffer.
 * @param {!Song} song The song to render.
 * @param {!AudioContext} ctx The web audio context.
 * @param {!AudioNode} destination The destination node to send audio to.
 * @param {number} startTime Audio context timestamp at which to start the song.
 * @returns {{
 *   LoopTime: number,
 *   EndTime: number,
 * }} LoopTime is the timestamp when the next loop starts, EndTime is the time
 * when playback finishes.
 */
export function PlaySong(song, ctx, destination, startTime) {
  const { TickDuration, Duration, Tracks } = song;
  const gain = ctx.createGain();
  gain.gain.value = 0.2;
  gain.connect(destination);
  let EndTime = startTime;
  for (const track of Tracks) {
    const { Values, Durations, Instrument, ConstantDuration } = track;
    let t = startTime;
    for (let i = 0; i < Values.length; i++) {
      const noteValue = Values[i];
      const noteDuration = Durations[i];

      if (noteValue > 0) {
        let end = PlaySynth(
          Sounds[Instrument],
          ctx,
          gain,
          t,
          (ConstantDuration || noteDuration) * TickDuration,
          noteValue,
        );
        if (end > EndTime) {
          EndTime = end;
        }
      }

      t += noteDuration * TickDuration;
    }
  }

  return {
    LoopTime: TickDuration * Duration,
    EndTime,
  };
}
