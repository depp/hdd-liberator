import { Sounds, Song } from './audio.data.js';
import { PlaySynth } from './audio.synth.js';

/**
 * Render a song to an audio buffer.
 * @param {!Song} song The song to render.
 * @param {!BaseAudioContext} ctx The web audio context.
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
  let EndTime = startTime;
  for (const track of Tracks) {
    const { Voices, Durations, Instrument, ConstantDuration } = track;
    const gain = ctx.createGain();
    gain.gain.value = track.Gain;
    gain.connect(destination);
    const pan = ctx.createStereoPanner();
    pan.connect(gain);
    pan.pan.value = track.Pan;
    for (let voice of Voices) {
      let t = startTime;
      for (let i = 0; i < voice.length; i++) {
        const noteValue = voice[i];
        const noteDuration = Durations[i];

        if (noteValue > 0) {
          let end = PlaySynth(
            Sounds[Instrument],
            ctx,
            pan,
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
  }

  return {
    LoopTime: TickDuration * Duration,
    EndTime,
  };
}
