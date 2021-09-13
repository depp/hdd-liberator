import { COMPO } from './common.js';
import { Songs } from './audio.data.js';
import { PlaySong } from './audio.music.js';

export const MusicLightOfCreation = 0;
export const MusicAfterDark = 1;

const NumSongs = 2;

/**
 * Length of the audio tail for songs, in seconds. The amount of time after the
 * last note is released that rendering stops.
 * @const
 */
const MusicTail = 2;

/**
 * Delay, in seconds, before the start of a song in a music track.
 * @const
 */
const MusicHead = 0.1;

/**
 * Sample rate for offline rendering.
 * @const
 */
const OfflineSampleRate = 44100;

/**
 * @type {AudioContext?}
 */
let Ctx;

/**
 * @typedef {{
 *   Buffer: !AudioBuffer,
 *   LoopTime: number,
 * }}
 */
var RenderedTrack;

/**
 * @type {!Array<RenderedTrack>}
 */
let Tracks = [];

/**
 * Index of the current playing track.
 * @type {number}
 */
let CurrentTrack = -1;

/**
 * @type {?AudioBufferSourceNode}
 */
let CurrentTrackSource;

/** @type {number} */
let CurrentTrackLoopTime;

/**
 * @type {number?}
 */
let Timeout;

/**
 * Play a sound with the given buffer.
 * @param {AudioBuffer} buffer
 * @param {number=} startTime
 * @return {AudioBufferSourceNode}
 */
function PlayBuffer(buffer, startTime) {
  if (!COMPO && !Ctx) {
    throw new Error('Ctx is null');
  }
  const source = Ctx.createBufferSource();
  source.buffer = buffer;
  source.connect(Ctx.destination);
  source.start(startTime);
  return source;
}

/**
 * Start playing the next loop of the current song.
 */
function LoopCurrentSong() {
  var track;
  Timeout = 0;
  track = Tracks[CurrentTrack + NumSongs] ?? Tracks[CurrentTrack];
  StartTrack(track, CurrentTrackLoopTime);
}

/**
 * @param {RenderedTrack} track
 * @param {number=} startTime
 */
function StartTrack({ Buffer, LoopTime }, startTime) {
  startTime = startTime ?? Ctx.currentTime;
  CurrentTrackSource = PlayBuffer(Buffer, startTime);
  CurrentTrackLoopTime = startTime + LoopTime;
  if (Timeout) {
    clearTimeout(Timeout);
  }
  Timeout = setTimeout(
    LoopCurrentSong,
    1000 * Math.max(1, CurrentTrackLoopTime - Ctx.currentTime - 1),
  );
}

/**
 * Render music and sound effects. This will run in the background
 * asynchronously.
 */
export async function Render() {
  var i;
  for (i = 0; i < Songs.length; i++) {
    var song = Songs[i];
    var constructor =
      window.OfflineAudioContext ?? window.webkitOfflineAudioContext;
    if (!constructor) {
      return;
    }
    var end = 0;
    var track;
    var tlen;
    var dur;
    for (track of song.Tracks) {
      tlen = 0;
      for (dur of track.Durations) {
        tlen += dur;
      }
      if (tlen > end) {
        end = tlen;
      }
    }
    end = end * song.TickDuration + MusicTail;
    var ctx = new constructor(
      2,
      (end * OfflineSampleRate) | 0,
      OfflineSampleRate,
    );
    var { LoopTime } = PlaySong(song, ctx, ctx.destination, MusicHead);
    var Buffer = await ctx.startRendering();
    Tracks[i] = { LoopTime, Buffer };
    if (CurrentTrack == i) {
      StartTrack(Tracks[i]);
    }
  }
}

/**
 * @param {number} index
 */
export function PlayTrack(index) {
  if (index == CurrentTrack) {
    return;
  }
  CurrentTrack = index;
  var track = Tracks[index];
  if (track) {
    StartTrack(track);
  }
}

/**
 * Start the audio system. This must be called while handling a UI event.
 * @return {boolean} True if successful.
 */
export function Start() {
  const constructor = window.AudioContext ?? window.webkitAudioContext;
  if (!constructor) {
    if (!COMPO) {
      console.error('No audio context constructor');
    }
    return false;
  }
  Ctx = new constructor();
  const silence = Ctx.createBuffer(1, 1000, Ctx.sampleRate);
  PlayBuffer(silence);
  return true;
}

/**
 * Stop the audio system.
 */
export function Stop() {
  if (Ctx) {
    Ctx.close();
    Ctx = null;
    CurrentTrackSource = null;
    if (Timeout) {
      clearTimeout(Timeout);
    }
  }
}
