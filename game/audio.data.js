import { COMPO, NUM_VALUES } from './common.js';
import { Iterate } from './util.js';

/** @type {Array<!Array<number>>} */
export let Sounds;

/**
 * @typedef {{
 *   Voices: !Array<!Array<number>>,
 *   Durations: !Array<number>,
 *   Instrument: number,
 *   Gain: number,
 *   Pan: number,
 *   ConstantDuration: number,
 * }}
 */
export var Track;

/**
 * @typedef {{
 *   TickDuration: number,
 *   Duration: number,
 *   Tracks: Array<Track>!,
 * }}
 */
export var Song;

/**
 * @type {Array<Song>}
 */
export let Songs;

/**
 * Load all audio data from the raw binary data.
 * @param {!Array<number>} data
 */
export function Load(data) {
  const initialValue = 60;
  /** @type {number} */
  let pos = 2;
  /** @type {Array<Track!>!} */
  let allTracks = [];
  let [nsounds, nsongs] = data;
  Sounds = [];
  Songs = [];
  while (nsounds--) {
    if (!COMPO && pos + 1 > data.length) {
      throw new Error('music parsing failed');
    }
    const length = data[pos++];
    if (!COMPO && pos + length > data.length) {
      throw new Error('music parsing failed');
    }
    Sounds.push(data.slice(pos, (pos += length)));
  }
  while (nsongs--) {
    if (!COMPO && pos + 4 > data.length) {
      throw new Error('music parsing failed');
    }
    let [numtracks, tickduration, lengthHi, lengthLo] = data.slice(
      pos,
      (pos += 4),
    );
    if (!COMPO && pos + 4 * numtracks > data.length) {
      throw new Error('music parsing failed');
    }
    /** @type {!Array<!Track>} */
    const Tracks = Iterate(numtracks, () => {
      let [Instrument, gain, pan, ConstantDuration] = data.slice(
        pos,
        (pos += 4),
      );
      return /** @type {Track} */ ({
        Instrument,
        Gain: 0.94 ** gain,
        Pan: (pan - ((NUM_VALUES - 1) >> 1)) / 60,
        ConstantDuration,
      });
    });
    allTracks.push(...Tracks);
    Songs.push({
      TickDuration: tickduration / 500,
      Duration: NUM_VALUES * lengthHi + lengthLo,
      Tracks,
    });
  }
  for (const track of allTracks) {
    /** @type {!Array<!Array<number>>} */
    let voices = [[]];
    /** @type {!Array<number>} */
    let last = [initialValue];
    let nvoices = 1;
    let i;
    track.Voices = voices;
    while (1) {
      if (!COMPO && pos >= data.length) {
        throw new Error('music parsing failed');
      }
      const byte = data[pos++];
      if (byte < NUM_VALUES - 6) {
        pos--;
        for (i = 0; i < nvoices; i++) {
          voices[i].push(
            (last[i] =
              ((last[i] ?? last[i - 1]) + data[pos++]) % (NUM_VALUES - 6)),
          );
        }
        for (; i < voices.length; i++) {
          voices[i].push(-1);
        }
      } else if (byte == NUM_VALUES - 1) {
        // End of track
        break;
      } else if (byte == NUM_VALUES - 6) {
        for (i = 0; i < voices.length; i++) {
          // Rest
          voices[i].push(-1);
        }
      } else {
        // Polyphony change
        nvoices = byte - (NUM_VALUES - 6);
        while (voices.length < nvoices) {
          voices.push(Array(voices[0].length).fill(-1));
        }
      }
    }
  }
  for (const track of allTracks) {
    track.Durations = data.slice(pos, (pos += track.Voices[0].length));
  }
}
